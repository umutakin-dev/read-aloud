# Active tab ID lost when service worker is evicted

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`activeTabId` (`background.js:51`) and `offscreenCreated` (`background.js:29`) are module-level variables in an MV3 service worker, which Chrome evicts after ~30s idle.

During playback the 50ms `AUDIO_TIME` ticks keep the worker alive, so it holds. But `PAUSE` clears that interval (`offscreen.js:45`) — pause for 30 seconds and the worker dies. On the next event `activeTabId` is `null`, so the `AUDIO_ENDED` relay at `background.js:56-60` is dropped and playback stalls at the end of the current paragraph with no error surfaced.

`offscreenCreated` recovers by accident: `ensureOffscreen` catches the "Only a single offscreen" error (`background.js:42`). `activeTabId` has no such fallback.

**Fix:** persist `activeTabId` in `chrome.storage.session`, and derive offscreen existence from `chrome.runtime.getContexts()` instead of a boolean flag.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] `activeTabId` survives service-worker eviction (`chrome.storage.session`)
- [ ] Offscreen document existence checked via `chrome.runtime.getContexts()`, not a module flag
- [ ] Pause for >30s, then resume — playback continues to the next paragraph

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
- **Delivered:** 9f475b0 (fix: survive service worker eviction, settle cancelled audio promises) and 542b3e2 (feat: navigate by paragraph, resume after offscreen teardown, show engine)

### 2026-08-03
- **Progress:** Verified: a pause long enough for Chrome to discard the offscreen document now resumes exactly where it left off, rather than doing nothing. Persisting the tab in session storage was necessary but not sufficient — rebuilding the document and seeking to the saved position is what fixed it.

### 2026-08-03
- **Note:** Still reproduces after the storage.session fix. Short pauses resume fine; a pause of a couple of minutes leaves Play doing nothing. Persisting activeTabId was necessary but not sufficient — the offscreen document itself is the casualty. Chrome tears down an AUDIO_PLAYBACK offscreen document once it stops actually playing, so on resume hasOffscreen() is false and the RESUME message is silently dropped by the 'if (!exists) return' guard. Fix must recreate the document and replay from the saved position rather than assuming it survived.

### 2026-08-03
- **Progress:** Shipped in 9f475b0.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
