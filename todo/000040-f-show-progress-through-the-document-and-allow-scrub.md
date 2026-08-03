# Show progress through the document and allow scrubbing

**Type:** ✨ Feature
**Status:** 📋 Backlog
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

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Progress bar reflects position through the document
- [ ] Time remaining estimated from measured synthesis durations
- [ ] Estimate accounts for playback rate and improves as it goes
- [ ] Dragging jumps, snapping to paragraph boundaries
- [ ] Scrubbing backwards re-synthesizes without stalling
- [ ] Toolbar layout still works at narrow widths

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Note:** Item created
