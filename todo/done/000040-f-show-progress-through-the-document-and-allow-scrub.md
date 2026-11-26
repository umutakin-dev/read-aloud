# Show progress through the document and allow scrubbing

**Type:** ✨ Feature
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000037

## Description

`Paragraph 3/198` is the only sense of position on offer. It says where you are but nothing about how much is left in time, which is what a listener actually wants to know — thirty short comments and thirty long ones are the same number and very different commitments.

Two parts:

- **Progress.** A bar, and an estimate of time remaining. The estimate is available more cheaply than it looks: synthesized chunks report their exact duration, and characters-per-second from those can project the rest, improving as it goes. Divide by the playback rate to keep it honest at 2x.
- **Scrubbing.** Dragging the bar to jump. Snapping to paragraph boundaries rather than arbitrary offsets, since paragraphs are the unit everything else works in.

Note that scrubbing backwards into a chunk that has been played and dropped means re-synthesizing it, which is where #000042 stops being a nicety.

The toolbar is already busy — prev, play, next, stop, speed, status, engine, close. Adding a bar and a time may need the layout reconsidered rather than another control wedged in.


## Estimation

- **Start:** 2026-11-28
- **End:** 2026-11-29
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-24 07:23 UTC
- **End:** 2026-11-26 07:06 UTC
- **Effort:** 1m

## Requirements

- [x] Progress bar reflects position through the document
- [x] Time remaining estimated from measured synthesis durations
- [x] Estimate accounts for playback rate and improves as it goes
- [x] Dragging jumps, snapping to paragraph boundaries
- [x] Scrubbing backwards re-synthesizes without stalling
- [x] Toolbar layout still works at narrow widths
- [x] The bar shows a second shade for sentences already synthesized, from 000053's record

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-26 07:06 UTC
- **Note:** Took 1m against an estimate of 5h (0.0x) — measured since the previous item closed.

### 2026-11-26 07:06 UTC

- **Progress:** Completed

### 2026-11-26 07:06 UTC
- **Progress:** Umut tried the bar in Chrome and Firefox (2026-11-26), including dragging and a narrow window: it works in both. His screenshot shows 'Paragraph 22/119 · 14 min left' at 2.0x.

### 2026-11-26 07:06 UTC
- **Progress:** ☑ Checked (Requirements): Toolbar layout still works at narrow widths

### 2026-11-24 07:26 UTC
- **Progress:** Built: bottom-edge bar (played, synthesized shade from the record, rest), time left in the status from measured durations / speed, click/drag/keys jump to paragraph starts, paused stays paused. 349 extension tests pass. Left for Umut: the look at narrow widths, in Chrome and Firefox.

### 2026-11-24 07:26 UTC
- **Progress:** ☑ Checked (Requirements): The bar shows a second shade for sentences already synthesized, from 000053's record

### 2026-11-24 07:26 UTC
- **Progress:** ☑ Checked (Requirements): Scrubbing backwards re-synthesizes without stalling

### 2026-11-24 07:26 UTC
- **Progress:** ☑ Checked (Requirements): Dragging jumps, snapping to paragraph boundaries

### 2026-11-24 07:26 UTC
- **Progress:** ☑ Checked (Requirements): Estimate accounts for playback rate and improves as it goes

### 2026-11-24 07:26 UTC
- **Progress:** ☑ Checked (Requirements): Time remaining estimated from measured synthesis durations

### 2026-11-24 07:26 UTC
- **Progress:** ☑ Checked (Requirements): Progress bar reflects position through the document

### 2026-11-24 07:23 UTC

- **Progress:** Started work

### 2026-11-23 22:06 UTC
- **Decision:** Roadmap: 🎯 NOW 5 → 🎯 NOW 4

### 2026-11-23 20:46 UTC
- **Decision:** Roadmap: 🔜 NEXT 1 → 🎯 NOW 4

### 2026-11-23 12:53 UTC
- **Decision:** Roadmap: (unscheduled) → 🔜 NEXT 1

### 2026-11-23 12:52 UTC
- **Decision:** Umut, 2026-11-23: show how much of the page is synthesized as a second shade on the bar, like a video's buffered range. The whole page is synthesized in the background (000053), so the shade fills across the article.

### 2026-08-03

- **Note:** Item created
