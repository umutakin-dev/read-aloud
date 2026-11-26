# Audio keeps playing after the reading page reloads or navigates away

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-23 21:24 UTC

**Parent:** 000028

## Description

Refreshing the page mid-read leaves the current audio playing to its end (Umut, 2026-11-24, Firefox, testing 000053). The background stops the player only when the reading tab is closed (`tabs.onRemoved`); a reload or a navigation to another page tells it nothing, so the player finishes whatever it had loaded. With 500-character chunks that was up to half a minute; with sentences it is a few seconds.

**Fix:** the content script tells the background to stop on `pagehide`, which fires on a reload, a navigation and a move into the back-forward cache, but not on a same-page `#fragment` jump (Hacker News's root and parent links).

## Estimation

- **Start:** 2026-11-25
- **End:** 2026-11-27
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-24 07:19 UTC
- **End:** 2026-11-26 07:03 UTC
- **Effort:** 4m

## Requirements

- [x] Reloading or leaving the page stops the audio at once, in Chrome and Firefox
- [x] A same-page #fragment jump does not stop it
- [x] A test covers the stop on pagehide

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-26 07:03 UTC
- **Note:** Took 4m against an estimate of 5h (0.0x) — measured since the previous item closed.

### 2026-11-26 07:03 UTC

- **Progress:** Completed

### 2026-11-26 07:03 UTC
- **Progress:** Umut reloaded mid-sentence in Chrome and Firefox (2026-11-26): the audio stops at once in both. His Chrome log shows page.leave then read.stop.

### 2026-11-26 07:03 UTC
- **Progress:** ☑ Checked (Requirements): Reloading or leaving the page stops the audio at once, in Chrome and Firefox

### 2026-11-24 07:20 UTC
- **Progress:** Built: pagehide stops reading (stopReadAloud sends STOP_AUDIO and removes the toolbar), logged as page.leave; a hashchange does not. Tests fail without the fix. Waiting on Umut: a reload mid-sentence in Firefox and Chrome.

### 2026-11-24 07:20 UTC
- **Progress:** ☑ Checked (Requirements): A test covers the stop on pagehide

### 2026-11-24 07:20 UTC
- **Progress:** ☑ Checked (Requirements): A same-page #fragment jump does not stop it

### 2026-11-24 07:19 UTC

- **Progress:** Started work

### 2026-11-23 22:06 UTC
- **Decision:** Roadmap: 🎯 NOW 3 → 🎯 NOW 2

### 2026-11-23 21:24 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 2

### 2026-11-23 21:24 UTC
- **Note:** Dedup: read 000033 (a second reading tab orphans the first), 000034 (stale text index on client-side navigation) and 000035 (remember position across a reload). None covers audio outliving a real reload.

### 2026-11-23 21:24 UTC

- **Note:** Item created
