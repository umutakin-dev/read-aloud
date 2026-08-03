# Word highlight offsets drift within a paragraph

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

Even once #000003 makes the paragraph match, the per-word offsets are wrong.

`content.js:183-185` reconstructs each word's character offset by summing `timestamps[i].word.length + 1`, which assumes the token list rejoins into the original paragraph with exactly one space between every entry. It does not: Kokoro emits punctuation as its own tokens and the server strips them to bare text (`tts_engine.py:93`), so every punctuation mark and every contraction split injects a phantom space. The error accumulates, and the highlight walks progressively further from the word actually being spoken.

The same flawed accumulator drives the sentence range at `content.js:215-222`.

**Fix:** have the server return the character span of each token within the request text instead of just the word string, so the client never has to re-derive offsets. Failing that, align tokens to the paragraph text by scanning forward from the previous match rather than assuming a fixed join.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Word character offsets are derived from actual positions, not a fixed `+1` join
- [ ] Sentence range uses the same corrected offsets
- [ ] Highlight stays on the spoken word through a long paragraph with punctuation and contractions
- [ ] Server response carries per-token character spans (or client aligns by forward scan)

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** ac9bd50 (fix: correct playback speed and word highlighting)

### 2026-08-03
- **Progress:** Verified in Chrome: server reported Token alignment 100% on all four paragraphs (77/77, 91/91, 45/45, 74/74), so no word position is being estimated, and the highlight sat on the correct word mid-paragraph rather than drifting ahead.

### 2026-08-03
- **Progress:** Shipped in ac9bd50.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03
- **Progress:** Server now aligns each token to a character span in the request text (align_timestamps_to_text, forward-scanning so repeated words resolve correctly). Client consumes start_char/end_char via resolveWordSpans and no longer re-derives offsets from word lengths. Verified alignment against 7 cases including punctuation tokens, contractions and unfindable rewrites.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
