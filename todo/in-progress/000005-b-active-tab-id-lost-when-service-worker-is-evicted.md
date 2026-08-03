# Active tab ID lost when service worker is evicted

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
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
- **Progress:** Shipped in 9f475b0.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
