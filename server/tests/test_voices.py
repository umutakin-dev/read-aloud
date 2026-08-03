"""Covers the voice catalogue and the language each voice belongs to.

Kokoro's lang_code selects the grapheme-to-phoneme conversion, and it was
hardcoded to "a" — American English — while the catalogue offered four British
voices. Emma and George were read with American pronunciation: not broken
enough to notice at a glance, which is how it survived.
"""

import pytest

from tts_server.voices import (
    DEFAULT_LANGUAGE,
    LANGUAGES,
    VOICE_CATALOG,
    language_for_voice,
    language_name,
    list_voices,
)


@pytest.mark.parametrize(
    "voice,expected",
    [
        ("af_heart", "a"),
        ("af_alloy", "a"),
        ("am_michael", "a"),
        ("bf_emma", "b"),
        ("bf_isabella", "b"),
        ("bm_george", "b"),
        ("bm_lewis", "b"),
    ],
)
def test_language_comes_from_the_voice_id(voice, expected):
    assert language_for_voice(voice) == expected


def test_every_british_voice_asks_for_british_phonemes():
    # The bug, stated directly.
    british = [v for v, info in VOICE_CATALOG.items() if info["language"] == "en-gb"]
    assert british, "catalogue has no British voices to check"
    for voice in british:
        assert language_for_voice(voice) == "b", f"{voice} would be read as American"


def test_every_american_voice_asks_for_american_phonemes():
    american = [v for v, info in VOICE_CATALOG.items() if info["language"] == "en-us"]
    assert american
    for voice in american:
        assert language_for_voice(voice) == "a"


def test_the_catalogue_agrees_with_the_voice_id_prefix():
    # If these ever disagree, one of them is lying to the user: the popup shows
    # the catalogue's language while synthesis follows the prefix.
    expected_by_prefix = {"a": "en-us", "b": "en-gb"}
    for voice, info in VOICE_CATALOG.items():
        assert info["language"] == expected_by_prefix[language_for_voice(voice)], voice


@pytest.mark.parametrize("voice", ["", None, "x_unknown", "zz", "  "])
def test_an_unrecognised_voice_falls_back_rather_than_raising(voice):
    assert language_for_voice(voice) == DEFAULT_LANGUAGE


def test_a_voice_kokoro_ships_but_the_catalogue_lacks_still_resolves():
    # Derived from the id rather than looked up, so a new British voice gets
    # British phonemes without the catalogue being updated first.
    assert "bm_daniel" not in VOICE_CATALOG
    assert language_for_voice("bm_daniel") == "b"


def test_language_names_are_readable():
    assert language_name("a") == "American English"
    assert language_name("b") == "British English"
    assert language_name("zz") == "zz"


def test_every_language_in_the_catalogue_has_a_pipeline_code():
    for voice in VOICE_CATALOG:
        assert language_for_voice(voice) in LANGUAGES


def test_list_voices_matches_the_catalogue():
    listed = list_voices()
    assert len(listed) == len(VOICE_CATALOG)
    for entry in listed:
        assert set(entry) == {"id", "name", "language", "gender"}
        assert entry["id"] in VOICE_CATALOG
