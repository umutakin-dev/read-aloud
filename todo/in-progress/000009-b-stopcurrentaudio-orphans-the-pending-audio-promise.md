# stopCurrentAudio orphans the pending audio promise

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`stopCurrentAudio()` nulls `audioResolve` and `audioReject` (`content.js:667-668`) without ever settling the promise they belong to. The `await playAudioFromBase64(...)` inside `playParagraphWithServer` (`content.js:377`) therefore never returns, and that async invocation is pinned forever along with everything it closes over.

Harmless today because the `if (state.active && state.playing)` guard below the await would have stopped advancement anyway — but the cleanup on `content.js:379-380` never runs, and this will bite the first time someone adds meaningful work after the await.

**Fix:** settle the pending promise (reject with a sentinel, or resolve with a "cancelled" flag) before clearing the handles, and have the awaiting code check for cancellation explicitly.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Pending audio promise is settled before its handles are cleared
- [ ] Awaiting code distinguishes cancellation from a real playback error
- [ ] Cancellation does not trigger the fallback-to-browser-TTS path
- [ ] Rapid prev/next clicking leaves no accumulating pending promises

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03
- **Progress:** Shipped in 9f475b0 and 913e978.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
