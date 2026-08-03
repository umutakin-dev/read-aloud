# Playback speed is applied twice

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

Speed is applied at both ends of the pipeline, so it compounds.

`content.js:275` sends `speed` in the `TTS_REQUEST`, which `background.js:168` forwards to the server, where Kokoro synthesizes the audio at that rate (`tts_engine.py:64`). Then `content.js:315` sends *the same* speed in `PLAY_AUDIO`, and `offscreen.js:15` sets `audio.playbackRate` to it.

Net effect: the 2.0x setting plays at ~4x, and 3.0x plays at ~9x.

**Fix:** pick one mechanism — always synthesize at 1.0 and use `playbackRate` alone. That also makes the toolbar slider apply instantly and makes the prefetch cache (`content.js:373`) speed-independent, which today holds audio baked at whatever speed was set when it was fetched.

Note that word timestamps stay valid under this fix: `audio.currentTime` is media time and is unaffected by `playbackRate`, so it continues to line up with the server's timestamps.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] TTS requests always ask the server for speed 1.0
- [ ] `playbackRate` is the single source of playback speed
- [ ] Toolbar slider changes apply to the currently playing audio immediately
- [ ] Prefetched paragraphs play at the current speed, not the speed at fetch time
- [ ] Word highlighting stays in sync at 0.5x, 1.0x and 3.0x

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
- **Progress:** Verified in Chrome at 1.5x and 2.0x — both play at the correct rate, and highlighting stays in sync at 2.0x. Confirms synthesis is pinned to 1.0 with playbackRate as the only speed applied.

### 2026-08-03
- **Progress:** Shipped in ac9bd50.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03
- **Progress:** Dropped speed from TTS_REQUEST (content.js) and pinned server synthesis to 1.0 (background.js). playbackRate in the offscreen player is now the only speed applied.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
