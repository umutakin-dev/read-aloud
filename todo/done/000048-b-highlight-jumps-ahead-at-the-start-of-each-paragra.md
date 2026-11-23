# Highlight jumps ahead at the start of each paragraph

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-11-16 11:21 UTC

**Parent:** 000028

## Description

When a paragraph ends by itself, the next one starts with the previous paragraph's playback time still set, so the highlight lands seconds into the new paragraph and snaps back on the first time update. Prev and Next reset it; the natural advance did not.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:** 2026-11-16 12:56 UTC
- **End:** 2026-11-23 11:18 UTC
- **Effort:**

## Requirements

- [ ]

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [x] Fix implemented
- [x] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-23 11:18 UTC

- **Progress:** Completed

### 2026-11-23 11:18 UTC
- **Delivered:** PR #8 (fix: highlight no longer jumps ahead when a paragraph starts)

### 2026-11-23 11:18 UTC
- **Progress:** ☑ Checked (Checklist): Fix verified — bug no longer reproduces

### 2026-11-23 11:18 UTC
- **Progress:** ☑ Checked (Checklist): Fix implemented

### 2026-11-16 12:56 UTC
- **Progress:** Fixed by resetting state._currentTime when a chunk's timestamps are set. User verified in Firefox on the combined test branch.

### 2026-11-16 12:56 UTC

- **Progress:** Started work

### 2026-11-16 11:21 UTC

- **Note:** Item created
