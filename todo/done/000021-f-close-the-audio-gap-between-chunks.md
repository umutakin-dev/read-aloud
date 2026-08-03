# Close the audio gap between chunks

**Type:** ✨ Feature
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

There is an audible gap when playback crosses from one chunk to the next, even though the next chunk's audio was fetched well in advance and is sitting in `prefetchCache`. Prefetching removed the *network* from the boundary but left everything else on it.

What actually happens between the last sample of one chunk and the first of the next:

1. offscreen `onended` → message to the service worker
2. worker reads the active tab from session storage → message to the content script
3. content script resolves the pending promise, calls `playChunkWithServer(n+1)`
4. `PLAY_AUDIO` carries the whole WAV as base64 — a 27-second chunk is ~1.3 MiB, ~1.8 MB once base64'd — to the worker
5. worker calls `setActiveTab` (a storage write) and `ensureOffscreen`, which runs `chrome.runtime.getContexts()` on every single play
6. the same ~1.8 MB is serialized a second time, worker → offscreen
7. offscreen decodes it, builds a Blob, mints an object URL, constructs an `Audio`, and only then can start

So the boundary pays for two 1.8 MB structured clones, a storage write, a `getContexts` round trip, and a fresh decode — all of which could have happened while the previous chunk was still playing.

**Approach:** hand the audio to the player early and make the boundary message tiny.

- When a prefetch for the immediately-next chunk completes, push it to the offscreen document as `PRELOAD`, which decodes it and calls `load()` there and then
- `PLAY` sends only a key; if the offscreen has that key preloaded it swaps to the ready element
- If it does not — the document was torn down, or the preload never arrived — it answers `needAudio` and the content script resends with the base64, so the slow path still works
- Try `PLAY` before `ensureOffscreen` so `getContexts` leaves the hot path, falling back to create-and-retry only when the send fails


## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Next chunk's audio is decoded and loaded before the current one ends
- [ ] Boundary message carries a key, not the audio
- [ ] Falls back to sending audio when the preload is missing
- [ ] Still works after the offscreen document is torn down mid-pause
- [ ] `getContexts` is off the per-play path
- [ ] Preloaded audio is released rather than leaking object URLs

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** abc7d7b (perf: preload the next chunk so the boundary is not spent shipping audio)

### 2026-08-03
- **Progress:** Verified: Umut listened through almost an entire Hacker News thread and noticed no gaps at chunk boundaries, where previously each one paid for two 1.8MB structured clones, a storage write, a getContexts round trip and a fresh decode.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
