"""The voice catalogue, and the language each voice belongs to.

Kept clear of torch so it can be imported — and tested — without the CUDA
stack, the same reason alignment.py exists.
"""

# Kokoro's lang_code selects the grapheme-to-phoneme conversion, and a voice id
# carries its language in the first character. Handing a British voice American
# phonemes is not broken enough to notice at a glance, which is how it went
# unnoticed: George read every word with an American pronunciation.
LANGUAGES = {
    "a": "American English",
    "b": "British English",
}

DEFAULT_LANGUAGE = "a"

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


def language_for_voice(voice: str) -> str:
    """The Kokoro lang_code a voice should be synthesized with.

    Derived from the voice id rather than the catalogue, so a voice Kokoro
    ships but this catalogue has not caught up with still gets the right
    pronunciation instead of silently falling back to American.
    """
    code = (voice or "")[:1].lower()
    return code if code in LANGUAGES else DEFAULT_LANGUAGE


def language_name(code: str) -> str:
    return LANGUAGES.get(code, code)


def list_voices() -> list[dict]:
    return [
        {"id": vid, "name": info["name"], "language": info["language"], "gender": info["gender"]}
        for vid, info in VOICE_CATALOG.items()
    ]
