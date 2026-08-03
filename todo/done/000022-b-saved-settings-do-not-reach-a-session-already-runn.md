# Saved settings do not reach a session already running

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`loadSettings()` runs once, at the top of `toggleReadAloud`. Saving from the popup while a page is being read therefore changes nothing until the session is stopped and started again — and the popup says "Saved!", so it looks like it worked.

Voice is the worst of these, because it is the setting most likely to be changed *because* of what is currently being heard. Even a fresh synthesis would not help on its own: `prefetchCache` is holding audio already produced in the old voice, and the offscreen document may be holding a decoded preload of it too.

Speed already works, but only by accident of being adjustable from the toolbar as well; changing it from the popup does nothing.

**Approach:** listen on `chrome.storage.onChanged` and apply each setting to the running session — speed to the live audio and the toolbar control, server URL and fallback to state. Voice additionally has to drop the prefetch cache and the preload, then re-synthesize the current chunk, since everything queued is in the wrong voice. Only resume automatically if it was playing, so a change made while paused does not start it.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Saving speed from the popup changes the audio already playing
- [ ] Saving speed from the popup updates the toolbar slider
- [ ] Saving a voice re-synthesizes in that voice without restarting the session
- [ ] Stale prefetched and preloaded audio in the old voice is discarded
- [ ] A change made while paused does not start playback
- [ ] Server URL and fallback changes apply without restarting

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
- **Delivered:** 127340c (fix: apply saved settings to a session already reading)

### 2026-08-03
- **Progress:** Verified: changing the voice from Alloy to Heart mid-session and saving switched smoothly, without stopping and restarting the session.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
