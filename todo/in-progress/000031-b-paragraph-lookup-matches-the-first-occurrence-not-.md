# Paragraph lookup matches the first occurrence, not the right one

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000028

## Description

`findParagraphOffset` locates a chunk with `state.textIndex.text.indexOf(paragraphText)` — from position zero, every time. It therefore finds the *first* occurrence in the page, not the one being read.

Any page where text repeats will highlight the wrong copy: a Hacker News comment quoting the one above it, a phrase appearing in both a summary and the body, repeated navigation labels, a pull quote duplicating a sentence. The listener hears the right words while the highlight sits somewhere else entirely, and the auto-scroll drags the viewport to the wrong place with it.

Splitting around URLs (#000023) made this more likely, since it produces shorter fragments and short fragments repeat more often.

**Fix:** search forward from where the previous chunk resolved, rather than from zero. Chunks are played in document order, so the correct occurrence is always at or after the last one. Fall back to a search from zero when the forward search fails — which is what a page mutating mid-read would look like — and reset the cursor when a new session starts or the user jumps backwards.

This is also a strictly cheaper search, since it scans less of the document each time.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Lookup starts from the previously resolved offset
- [ ] A page with a repeated phrase highlights the occurrence being read
- [ ] Falls back to searching from zero when the forward search misses
- [ ] Cursor resets on a new session and on backwards navigation
- [ ] Covered by a test with deliberately repeated text

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03
- **Progress:** findParagraphOffset now searches forward from the nearest chunk already located, rather than from position zero. The hint comes from a per-chunk offset map so jumping backwards works too — a single advancing cursor would search past the target on Prev. Offsets are dropped when the index is rebuilt, since they pointed into the old one. findChunkOffset and searchStartFor are pure and live in textkit, covered by 11 tests including a page where the same sentence appears twice.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
