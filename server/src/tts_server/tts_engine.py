import io
import logging
import threading

import numpy as np
import soundfile as sf
import torch

logger = logging.getLogger(__name__)

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
    for ts in timestamps:
        word = ts["word"]
        if not word:
            continue
        idx = text.find(word, cursor)
        if idx == -1:
            idx = lowered.find(word.lower(), cursor)
        if idx == -1:
            continue
        ts["start_char"] = idx
        ts["end_char"] = idx + len(word)
        cursor = idx + len(word)
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
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        self._pipeline = KPipeline(lang_code="a", device=device)
        self._initialized = True
        logger.info("Kokoro TTS pipeline initialized.")

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

        for result in self._pipeline(text, voice=voice, speed=speed):
            if result.audio is None:
                continue

            audio_np = result.audio.cpu().numpy()
            chunk_duration = len(audio_np) / SAMPLE_RATE
            cumulative_offset = cumulative_samples / SAMPLE_RATE

            # Extract word timestamps from tokens if available
            if result.tokens:
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
                # Fallback: estimate word timing from audio duration
                words = text.split() if not audio_chunks else result.graphemes.split()
                if words:
                    word_dur = chunk_duration / len(words)
                    for i, word in enumerate(words):
                        all_timestamps.append({
                            "word": word,
                            "start": round(cumulative_offset + i * word_dur, 4),
                            "end": round(cumulative_offset + (i + 1) * word_dur, 4),
                        })

            audio_chunks.append(audio_np)
            cumulative_samples += len(audio_np)

        if not audio_chunks:
            raise ValueError("No audio generated")

        audio = np.concatenate(audio_chunks)
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
