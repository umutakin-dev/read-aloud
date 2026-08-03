# Word highlighting never matches page DOM text

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

The headline feature silently no-ops on most real pages.

`splitIntoParagraphs` normalizes whitespace with `.replace(/\s+/g, " ")` (`content.js:62`, `content.js:69`), but `buildTextNodeMap` concatenates raw DOM text nodes untouched (`content.js:124`). `findRangesForParagraph` then does an exact `fullText.indexOf(paragraphText.substring(0, 100))` (`content.js:133`).

Any paragraph whose source DOM contains a newline or run of spaces between inline elements — which is most of them, given how HTML is typically formatted — fails to match, returns `null`, and highlighting quietly does nothing.

**Fix:** normalize both sides identically before matching, and keep an index mapping from normalized offsets back to raw `(node, offset)` pairs so `createRangeForWord` can still build real Ranges. Also worth handling the `idx === -1` case visibly rather than silently, so a future mismatch is diagnosable.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Text node map and paragraph text are normalized the same way before matching
- [ ] Normalized offsets map back to real `(node, offset)` pairs for Range construction
- [ ] Highlighting works on a real article with inline markup (`<a>`, `<em>`) inside paragraphs
- [ ] A failed match is logged rather than silently ignored

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
- **Progress:** Verified in Chrome on plato.stanford.edu/entries/computational-mind — word and sentence highlights render on the correct text mid-paragraph, which never happened before the whitespace-collapsing fix. No 'paragraph not found in page DOM' warnings.

### 2026-08-03
- **Progress:** Shipped in ac9bd50.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03
- **Progress:** Replaced buildTextNodeMap with buildTextIndex: collapses page whitespace identically to splitIntoParagraphs and keeps a per-character map back into the DOM. Added rebuild-and-retry plus prefix-match fallback, and a warning when a paragraph still cannot be located. Verified the collapsing invariants against 10 node layouts in Node.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
