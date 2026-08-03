"""Pure text helpers, kept clear of torch and numpy.

Separated from tts_engine so tests can import them without pulling in a
multi-gigabyte CUDA stack for logic that is only string handling.
"""

import logging

# Named for tts_engine so the alignment warnings keep appearing under the logger
# operators already watch, rather than moving to a new one.
logger = logging.getLogger("tts_server.tts_engine")


def preview(text: str, limit: int = 70) -> str:
    """A single-line excerpt of `text`, for logs."""
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


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
