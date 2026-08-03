"""Covers align_timestamps_to_text.

The client needs a character span per spoken word to turn it into a DOM Range,
and it cannot re-derive them by joining the words itself: Kokoro emits
punctuation as its own tokens and splits contractions, so any fixed join drifts
further from the truth with every word. That was #000004.

Imported from tts_server.alignment rather than tts_server.tts_engine: the
latter imports numpy, soundfile and torch at module level, and none of that is
needed to test string handling.
"""

import logging

import pytest

from tts_server.alignment import align_timestamps_to_text


def timestamps(*words):
    return [{"word": w, "start": 0.0, "end": 0.0} for w in words]


def spans(aligned):
    return [(t.get("start_char"), t.get("end_char")) for t in aligned]


def test_aligns_a_simple_sentence():
    text = "The quick brown fox."
    aligned = align_timestamps_to_text(text, timestamps("The", "quick", "brown", "fox"))
    assert spans(aligned) == [(0, 3), (4, 9), (10, 15), (16, 19)]


def test_every_span_slices_back_to_its_own_word():
    text = "In 1990 the world changed, quietly."
    aligned = align_timestamps_to_text(
        text, timestamps("In", "1990", "the", "world", "changed", ",", "quietly", ".")
    )
    for entry in aligned:
        assert text[entry["start_char"] : entry["end_char"]] == entry["word"]


def test_repeated_words_resolve_to_the_right_occurrence():
    # Scanning forward rather than searching from the start each time.
    text = "the cat sat on the mat"
    aligned = align_timestamps_to_text(
        text, timestamps("the", "cat", "sat", "on", "the", "mat")
    )
    assert spans(aligned) == [(0, 3), (4, 7), (8, 11), (12, 14), (15, 18), (19, 22)]


def test_punctuation_tokens_do_not_shift_the_words_after_them():
    # The exact failure in #000004: punctuation arrives as its own token, so
    # assuming one space between every word drifts from here on.
    text = "Hello, world!"
    aligned = align_timestamps_to_text(text, timestamps("Hello", ",", "world", "!"))
    assert spans(aligned) == [(0, 5), (5, 6), (7, 12), (12, 13)]


def test_a_split_contraction_still_anchors_what_follows():
    text = "It doesn't matter much"
    aligned = align_timestamps_to_text(
        text, timestamps("It", "doesn", "'t", "matter", "much")
    )
    assert spans(aligned) == [(0, 2), (3, 8), (8, 10), (11, 17), (18, 22)]


def test_falls_back_to_a_case_insensitive_match():
    text = "Kokoro speaks clearly"
    aligned = align_timestamps_to_text(text, timestamps("kokoro", "speaks", "clearly"))
    assert spans(aligned) == [(0, 6), (7, 13), (14, 21)]


def test_an_unfindable_rewrite_leaves_a_hole_without_cascading():
    # Kokoro reads "1990" as "nineteen ninety"; neither is in the text. The
    # words after it must still land correctly.
    text = "In 1990 the world changed"
    aligned = align_timestamps_to_text(
        text, timestamps("In", "nineteen", "ninety", "the", "world", "changed")
    )
    assert spans(aligned) == [
        (0, 2),
        (None, None),
        (None, None),
        (8, 11),
        (12, 17),
        (18, 25),
    ]


def test_an_empty_list_is_returned_unchanged():
    assert align_timestamps_to_text("anything", []) == []


def test_warns_when_alignment_is_poor(caplog):
    # This rate is the best available predictor of the highlight drifting, so
    # it has to be visible rather than silent.
    with caplog.at_level(logging.WARNING, logger="tts_server.tts_engine"):
        align_timestamps_to_text(
            "In 1990 the world changed",
            timestamps("In", "nineteen", "ninety", "the", "world", "changed"),
        )
    assert any("4/6" in r.getMessage() for r in caplog.records)


def test_stays_quiet_when_alignment_is_clean(caplog):
    with caplog.at_level(logging.WARNING, logger="tts_server.tts_engine"):
        align_timestamps_to_text("The quick brown fox", timestamps("The", "quick", "brown", "fox"))
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]


@pytest.mark.parametrize(
    "text,words",
    [
        ("", ["something"]),
        ("Some text here", [""]),
        ("Punctuation ... only", ["...", "only"]),
    ],
)
def test_does_not_raise_on_awkward_input(text, words):
    align_timestamps_to_text(text, timestamps(*words))
