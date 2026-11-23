import io
import logging
import threading
import time

import numpy as np
import soundfile as sf
import torch

from . import device as _device
from .alignment import align_timestamps_to_text, preview
from .voices import language_for_voice, language_name
from .voices import list_voices as _list_voices

logger = logging.getLogger(__name__)


def log_environment() -> None:
    _device.log_environment(torch)


SAMPLE_RATE = 24000

# Synthesized once when a pipeline is built on MPS. The first pass after a
# fresh install compiles Metal kernels: a chunk took 7s, where the CPU takes 2s.
# One word pays that once, before a reader is waiting on it (000049).
#
# It does not warm every chunk. Metal also compiles per input length and keeps
# those kernels on disk, so a length never seen before runs at 10-13x realtime,
# about what the CPU does, and a seen one at about 20x. MPS gets faster the
# more you read, and even its slowest chunk measured 4.6x, so playback never
# waits.
WARMUP_TEXT = "Hello."


class TTSEngine:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._pipelines = {}
                cls._instance._device = None
            return cls._instance

    def _ensure_device(self) -> str:
        if self._device is None:
            self._device = _device.select_device(torch)
        return self._device

    def _pipeline_for(self, voice: str):
        """The pipeline for this voice's language, created on first use.

        One pipeline per language rather than one globally: lang_code selects
        the grapheme-to-phoneme conversion, so a single American pipeline gave
        the British voices American pronunciation. Built lazily so startup does
        not pay for languages nobody selects.
        """
        language = language_for_voice(voice)
        existing = self._pipelines.get(language)
        if existing is not None:
            return existing

        from kokoro import KPipeline

        device = self._ensure_device()
        logger.info("Initializing Kokoro pipeline for %s...", language_name(language))
        started = time.perf_counter()
        try:
            pipeline = KPipeline(lang_code=language, device=device)
            if device == "mps":
                # Inside the try on purpose: an op MPS cannot run surfaces
                # here and degrades to the CPU, rather than failing a request.
                for _ in pipeline(WARMUP_TEXT, voice=voice, speed=1.0):
                    pass
        except Exception:
            if device == "cpu":
                raise
            # A driver mismatch or an already-occupied GPU only shows up here,
            # after cuda.is_available() has already said yes. Degrade rather
            # than refusing to serve.
            logger.exception("Kokoro failed to initialize on %s, falling back to CPU", device)
            self._device = device = "cpu"
            pipeline = KPipeline(lang_code=language, device=device)

        self._pipelines[language] = pipeline
        logger.info(
            "Kokoro pipeline for %s ready on %s in %.1fs",
            language_name(language), device, time.perf_counter() - started,
        )
        return pipeline

    def synthesize(self, text: str, voice: str = "af_heart", speed: float = 1.0) -> tuple[np.ndarray, int]:
        pipeline = self._pipeline_for(voice)
        audio_chunks = []
        for result in pipeline(text, voice=voice, speed=speed):
            if result.audio is not None:
                audio_chunks.append(result.audio.cpu().numpy())
        if not audio_chunks:
            raise ValueError("No audio generated")
        audio = np.concatenate(audio_chunks)
        return audio, SAMPLE_RATE

    def synthesize_with_timestamps(
        self, text: str, voice: str = "af_heart", speed: float = 1.0
    ) -> tuple[np.ndarray, int, list[dict]]:
        pipeline = self._pipeline_for(voice)
        audio_chunks = []
        all_timestamps = []
        cumulative_samples = 0
        from_tokens = 0
        estimated = 0
        started = time.perf_counter()

        logger.info(
            "Synthesizing %d chars | voice=%s (%s) speed=%.2f device=%s | %s",
            len(text), voice, language_name(language_for_voice(voice)),
            speed, self._device, preview(text),
        )

        for result in pipeline(text, voice=voice, speed=speed):
            if result.audio is None:
                logger.debug("Chunk produced no audio, skipping")
                continue

            audio_np = result.audio.cpu().numpy()
            chunk_duration = len(audio_np) / SAMPLE_RATE
            cumulative_offset = cumulative_samples / SAMPLE_RATE

            # Extract word timestamps from tokens if available
            if result.tokens:
                from_tokens += 1
                for token in result.tokens:
                    # MToken has start_ts and end_ts set by join_timestamps
                    if token.start_ts is not None and token.end_ts is not None:
                        word_text = token.text.strip() if hasattr(token, "text") else ""
                        if not word_text:
                            continue
                        all_timestamps.append({
                            "word": word_text,
                            "start": round(cumulative_offset + token.start_ts, 4),
                            "end": round(cumulative_offset + token.end_ts, 4),
                        })
            else:
                # No token timings for this chunk — spread its own words evenly
                # across its own duration. Reading from the full request text
                # here (as this once did for the first chunk) crams every word
                # of the request into one chunk's worth of audio, and then emits
                # them all again for the chunk that actually contains them.
                graphemes = getattr(result, "graphemes", None)
                words = graphemes.split() if graphemes else []
                if words:
                    estimated += 1
                    logger.debug(
                        "Chunk has no token timings; estimating %d word(s) evenly "
                        "across %.2fs", len(words), chunk_duration,
                    )
                    word_dur = chunk_duration / len(words)
                    for i, word in enumerate(words):
                        all_timestamps.append({
                            "word": word,
                            "start": round(cumulative_offset + i * word_dur, 4),
                            "end": round(cumulative_offset + (i + 1) * word_dur, 4),
                        })
                else:
                    # Better to highlight nothing for this chunk than to
                    # highlight the wrong words.
                    logger.warning(
                        "Chunk has neither token timings nor graphemes; "
                        "no timestamps emitted for it"
                    )

            audio_chunks.append(audio_np)
            cumulative_samples += len(audio_np)

        if not audio_chunks:
            raise ValueError("No audio generated")

        audio = np.concatenate(audio_chunks)
        elapsed = time.perf_counter() - started
        duration = len(audio) / SAMPLE_RATE
        logger.info(
            "Synthesized %.2fs of audio in %.2fs (%.1fx realtime) | %d chunk(s): "
            "%d timed by tokens, %d estimated | %d timestamp(s)",
            duration, elapsed, duration / elapsed if elapsed else 0.0,
            len(audio_chunks), from_tokens, estimated, len(all_timestamps),
        )
        return audio, SAMPLE_RATE, align_timestamps_to_text(text, all_timestamps)

    def audio_to_wav_bytes(self, audio: np.ndarray, sample_rate: int) -> bytes:
        buf = io.BytesIO()
        sf.write(buf, audio, sample_rate, format="WAV")
        buf.seek(0)
        return buf.read()

    def list_voices(self) -> list[dict]:
        return _list_voices()
