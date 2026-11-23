# Per-page sentence record, synthesized whole page ahead of the reader

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Roadmap:** 🎯 NOW 1
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

- **Start:** 2026-11-23 21:00 UTC
- **End:**
- **Effort:**

## Requirements

- [ ] Sentences are the unit of synthesis and playback, each with a state for the page
- [ ] Playback starts as soon as the first sentence is ready
- [ ] The whole page is synthesized in the background, one request at a time
- [ ] After a jump, synthesis continues from the jump target to the end, then fills the skipped gaps
- [ ] Ready audio is kept for the page, capped by size, oldest dropped first
- [ ] Going back to a ready sentence plays it with no synthesis
- [ ] Highlighting still lines up per word and per sentence on both engines
- [ ] No audible gap between sentences, measured on both engines
- [ ] Tests cover the ordering, the cap and the state changes

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

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
