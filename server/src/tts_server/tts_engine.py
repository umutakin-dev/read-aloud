import io
import logging
import threading
import time

import numpy as np
import soundfile as sf
import torch

logger = logging.getLogger(__name__)


def preview(text: str, limit: int = 70) -> str:
    """A single-line excerpt of `text`, for logs."""
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


def log_environment() -> None:
    logger.info("torch %s (CUDA build: %s)", torch.__version__, torch.version.cuda or "none")
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            logger.info(
                "CUDA device %d: %s (%.1f GiB, compute %d.%d)",
                i, props.name, props.total_memory / 1024**3, props.major, props.minor,
            )


def select_device() -> str:
    """Pick the compute device, and say why.

    Ending up on the CPU has two very different causes — no GPU on this machine,
    or a CPU-only torch wheel masking the GPU that is there — and only the second
    is fixable by reinstalling. The old one-line check could not tell them apart,
    which is exactly how a 4070 Ti ended up synthesizing on the CPU unnoticed.
    """
    if torch.cuda.is_available():
        logger.info("Using device: cuda (%s)", torch.cuda.get_device_name(0))
        return "cuda"

    if torch.version.cuda is None:
        logger.warning(
            "Using device: cpu — this torch is a CPU-only build (%s), so any GPU "
            "on this machine is invisible to it. Re-run `uv sync` in server/ to "
            "pick up the CUDA wheel.",
            torch.__version__,
        )
    else:
        logger.info(
            "Using device: cpu — torch has CUDA %s support but found no usable GPU.",
            torch.version.cuda,
        )
    return "cpu"

VOICE_CATALOG = {
    "af_alloy": {"name": "Alloy", "language": "en-us", "gender": "female"},
    "af_aoede": {"name": "Aoede", "language": "en-us", "gender": "female"},
    "af_bella": {"name": "Bella", "language": "en-us", "gender": "female"},
    "af_heart": {"name": "Heart", "language": "en-us", "gender": "female"},
    "af_jessica": {"name": "Jessica", "language": "en-us", "gender": "female"},
    "af_kore": {"name": "Kore", "language": "en-us", "gender": "female"},
    "af_nicole": {"name": "Nicole", "language": "en-us", "gender": "female"},
    "af_nova": {"name": "Nova", "language": "en-us", "gender": "female"},
    "af_river": {"name": "River", "language": "en-us", "gender": "female"},
    "af_sarah": {"name": "Sarah", "language": "en-us", "gender": "female"},
    "af_sky": {"name": "Sky", "language": "en-us", "gender": "female"},
    "am_adam": {"name": "Adam", "language": "en-us", "gender": "male"},
    "am_echo": {"name": "Echo", "language": "en-us", "gender": "male"},
    "am_eric": {"name": "Eric", "language": "en-us", "gender": "male"},
    "am_liam": {"name": "Liam", "language": "en-us", "gender": "male"},
    "am_michael": {"name": "Michael", "language": "en-us", "gender": "male"},
    "am_onyx": {"name": "Onyx", "language": "en-us", "gender": "male"},
    "bf_emma": {"name": "Emma", "language": "en-gb", "gender": "female"},
    "bf_isabella": {"name": "Isabella", "language": "en-gb", "gender": "female"},
    "bm_george": {"name": "George", "language": "en-gb", "gender": "male"},
    "bm_lewis": {"name": "Lewis", "language": "en-gb", "gender": "male"},
}

SAMPLE_RATE = 24000


def align_timestamps_to_text(text: str, timestamps: list[dict]) -> list[dict]:
    """Attach the character span of each spoken word within `text`.

    The client needs to turn a word into a DOM Range, and it cannot re-derive
    the offsets by joining the words itself: Kokoro emits punctuation as its
    own tokens and splits contractions, so any fixed join drifts further from
    the truth with every word.

    Words are matched by scanning forward from the previous match, so repeated
    words resolve to the correct occurrence. A word that cannot be found (Kokoro
    rewrites some tokens, e.g. "1990" -> "nineteen ninety") leaves its span as
    None and does not advance the cursor, so one miss cannot cascade.
    """
    lowered = text.lower()
    cursor = 0
    unaligned: list[str] = []
    for ts in timestamps:
        word = ts["word"]
        if not word:
            continue
        idx = text.find(word, cursor)
        if idx == -1:
            idx = lowered.find(word.lower(), cursor)
        if idx == -1:
            unaligned.append(word)
            continue
        ts["start_char"] = idx
        ts["end_char"] = idx + len(word)
        cursor = idx + len(word)

    # Every unaligned token is a word the client has to guess a position for, so
    # this rate is the best available predictor of the highlight drifting.
    total = len(timestamps)
    if total:
        aligned = total - len(unaligned)
        rate = aligned / total
        if rate < 0.9:
            logger.warning(
                "Token alignment %d/%d (%.0f%%) — the client will estimate positions "
                "for the rest, so highlighting may drift. Unaligned: %s",
                aligned, total, rate * 100,
                ", ".join(repr(w) for w in unaligned[:10]),
            )
        else:
            logger.debug("Token alignment %d/%d (%.0f%%)", aligned, total, rate * 100)
        if unaligned:
            logger.debug("Unaligned tokens: %s", ", ".join(repr(w) for w in unaligned))
    return timestamps


class TTSEngine:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def _ensure_initialized(self):
        if self._initialized:
            return
        from kokoro import KPipeline

        logger.info("Initializing Kokoro TTS pipeline...")
        started = time.perf_counter()
        device = select_device()
        try:
            self._pipeline = KPipeline(lang_code="a", device=device)
        except Exception:
            if device == "cpu":
                raise
            # A driver mismatch or an already-occupied GPU only shows up here,
            # after cuda.is_available() has already said yes. Degrade rather
            # than refusing to serve.
            logger.exception("Kokoro failed to initialize on GPU, falling back to CPU")
            device = "cpu"
            self._pipeline = KPipeline(lang_code="a", device=device)
        self._device = device
        self._initialized = True
        logger.info(
            "Kokoro TTS pipeline initialized on %s in %.1fs",
            device, time.perf_counter() - started,
        )

    def synthesize(self, text: str, voice: str = "af_heart", speed: float = 1.0) -> tuple[np.ndarray, int]:
        self._ensure_initialized()
        audio_chunks = []
        for result in self._pipeline(text, voice=voice, speed=speed):
            if result.audio is not None:
                audio_chunks.append(result.audio.cpu().numpy())
        if not audio_chunks:
            raise ValueError("No audio generated")
        audio = np.concatenate(audio_chunks)
        return audio, SAMPLE_RATE

    def synthesize_with_timestamps(
        self, text: str, voice: str = "af_heart", speed: float = 1.0
    ) -> tuple[np.ndarray, int, list[dict]]:
        self._ensure_initialized()
        audio_chunks = []
        all_timestamps = []
        cumulative_samples = 0
        from_tokens = 0
        estimated = 0
        started = time.perf_counter()

        logger.info(
            "Synthesizing %d chars | voice=%s speed=%.2f device=%s | %s",
            len(text), voice, speed, self._device, preview(text),
        )

        for result in self._pipeline(text, voice=voice, speed=speed):
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
        return [
            {"id": vid, "name": info["name"], "language": info["language"], "gender": info["gender"]}
            for vid, info in VOICE_CATALOG.items()
        ]
