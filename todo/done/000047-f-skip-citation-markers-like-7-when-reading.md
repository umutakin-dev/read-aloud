# Skip citation markers like [7] when reading

**Type:** ✨ Feature
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-16 10:49 UTC

**Parent:** 000037

## Description

Wikipedia-style reference markers ([7], [citation needed]) are spoken aloud and interrupt the sentence. Skip them by default, with a popup setting to read them. Extraction and the highlight index must drop the same text, or chunks stop matching the page.

## Items

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:** 2026-11-16 10:51 UTC
- **End:** 2026-11-23 12:17 UTC
- **Effort:** 1m

## Requirements

- [x] Bracketed superscripts ([7], [a], [citation needed]) and fragment-link footnote superscripts are not spoken
- [x] Paragraph extraction and the text index drop the same nodes, so highlighting still lines up
- [x] Popup setting to read them, on skip by default
- [x] Tests cover both sides

## Checklist

- [ ] Design/approach decided
- [x] Implementation complete
- [x] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-23 12:17 UTC

- **Progress:** Completed

### 2026-11-23 12:17 UTC
- **Delivered:** PR #10 (feat: skip citation markers like [7] when reading)

### 2026-11-23 12:17 UTC
- **Progress:** ☑ Checked (Checklist): Tested

### 2026-11-23 12:17 UTC
- **Progress:** ☑ Checked (Checklist): Implementation complete

### 2026-11-16 12:57 UTC
- **Progress:** User verified in Firefox on Wikipedia: markers skipped, highlighting lines up. Tests added in textkit.test.js. PR opened, based on the 000046 branch.

### 2026-11-16 12:57 UTC
- **Progress:** ☑ Checked (Requirements): Tests cover both sides

### 2026-11-16 12:57 UTC
- **Progress:** ☑ Checked (Requirements): Popup setting to read them, on skip by default

### 2026-11-16 12:57 UTC
- **Progress:** ☑ Checked (Requirements): Paragraph extraction and the text index drop the same nodes, so highlighting still lines up

### 2026-11-16 12:57 UTC
- **Progress:** ☑ Checked (Requirements): Bracketed superscripts ([7], [a], [citation needed]) and fragment-link footnote superscripts are not spoken

### 2026-11-16 10:51 UTC

- **Progress:** Started work

### 2026-11-16 10:49 UTC

- **Note:** Item created
