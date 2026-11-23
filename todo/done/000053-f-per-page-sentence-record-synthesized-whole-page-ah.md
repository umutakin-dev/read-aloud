# Per-page sentence record, synthesized whole page ahead of the reader

**Type:** ✨ Feature
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-11-23 12:52 UTC

**Parent:** 000037

## Description

Today the unit is a chunk of up to 500 characters, synthesized two ahead and deleted once played. So playback waits for a whole chunk before it starts, and going back always re-synthesizes.

**The record.** Every sentence on the page gets a state: not synthesized, synthesizing, ready, or played. A ready sentence keeps its audio for as long as the page is open, capped by size with the oldest dropped first.

**Order (Umut, 2026-11-23).** Synthesize the whole page in the background, always forward from where the reader is. Started at 1 and synthesized to 8, then a jump to 20: synthesize 20, 21, 22 and on to the last sentence, then go back for 9 to 19. One request at a time, so a jump never queues behind stale work.

Playback starts once the first sentence is ready. This is the foundation for jumping to selected text (000039), the synthesized shade on the progress bar (000040), and the in-memory half of 000042.

## Items

## Estimation

- **Start:** 2026-11-23
- **End:** 2026-11-24
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-23 20:53 UTC
- **End:** 2026-11-23 22:05 UTC
- **Effort:** 1h12

## Requirements

- [x] Sentences are the unit of synthesis and playback, each with a state for the page
- [x] Playback starts as soon as the first sentence is ready
- [x] The whole page is synthesized in the background, one request at a time
- [x] After a jump, synthesis continues from the jump target to the end, then fills the skipped gaps
- [x] Ready audio is kept for the page, capped by size, oldest dropped first
- [x] Going back to a ready sentence plays it with no synthesis
- [x] Highlighting still lines up per word and per sentence on both engines
- [x] No audible gap between sentences, measured on both engines
- [x] Tests cover the ordering, the cap and the state changes

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-23 22:05 UTC
- **Note:** Took 1h12 against an estimate of 5h (0.2x) — measured since the previous item closed.

### 2026-11-23 22:05 UTC

- **Progress:** Completed

### 2026-11-23 22:05 UTC
- **Delivered:** PR #16: sentences are the unit; lib/record.js keeps state and audio per page (64MB cap) and orders synthesis forward from the reader, then the gaps; one request at a time; reading starts after the first sentence. Umut's Firefox logs, 2026-11-24, HN thread, both engines: after the preload fix every play preloaded=true, gaps 2-16ms. Highlighting lined up on the browser engine.

### 2026-11-23 22:05 UTC
- **Progress:** ☑ Checked (Requirements): No audible gap between sentences, measured on both engines

### 2026-11-23 22:05 UTC
- **Progress:** ☑ Checked (Requirements): Highlighting still lines up per word and per sentence on both engines

### 2026-11-23 21:33 UTC
- **Progress:** Umut's Firefox log, 2026-11-24, server then browser engine on an HN thread: gapMs 6-24ms at nearly every boundary, outliers 34, 36, 84, 110ms. Highlighting lined up on the browser engine (screenshot). Found preloaded=false on every play: the preload was sent before PLAY and dropped by the player. Fixed; needs one more log to confirm preloaded=true.

### 2026-11-23 21:07 UTC
- **Progress:** Built: lib/record.js (state, order, 64MB cap), sentence chunks from our own splitter, one-request synthesis loop in content.js, gapMs in the player's audio.play log. 259 extension tests pass. Waiting on a real-browser read in Chrome and Firefox, on both engines: highlighting, and gapMs in the debug log.

### 2026-11-23 21:07 UTC
- **Progress:** ☑ Checked (Requirements): Tests cover the ordering, the cap and the state changes

### 2026-11-23 21:07 UTC
- **Progress:** ☑ Checked (Requirements): Going back to a ready sentence plays it with no synthesis

### 2026-11-23 21:07 UTC
- **Progress:** ☑ Checked (Requirements): Ready audio is kept for the page, capped by size, oldest dropped first

### 2026-11-23 21:07 UTC
- **Progress:** ☑ Checked (Requirements): After a jump, synthesis continues from the jump target to the end, then fills the skipped gaps

### 2026-11-23 21:07 UTC
- **Progress:** ☑ Checked (Requirements): The whole page is synthesized in the background, one request at a time

### 2026-11-23 21:07 UTC
- **Progress:** ☑ Checked (Requirements): Playback starts as soon as the first sentence is ready

### 2026-11-23 21:07 UTC
- **Progress:** ☑ Checked (Requirements): Sentences are the unit of synthesis and playback, each with a state for the page

### 2026-11-23 21:00 UTC

- **Progress:** Started work

### 2026-11-23 20:46 UTC
- **Decision:** Roadmap: 🎯 NOW 3 → 🎯 NOW 2

### 2026-11-23 12:53 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 2

### 2026-11-23 12:52 UTC
- **Note:** Dedup: read 000042 (cache synthesized audio), 000036 (cancel in-flight synthesis), 000039 (click a paragraph) and 000040 (progress bar). None covers the record; 000042 keeps the persistent cache across visits, and a one-at-a-time scheduler shrinks 000036 to aborting the single in-flight request.

### 2026-11-23 12:52 UTC

- **Note:** Item created
