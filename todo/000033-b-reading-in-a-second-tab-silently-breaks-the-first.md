# Reading in a second tab silently breaks the first

**Type:** 🐛 Bug
**Status:** 📋 Backlog
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000028

## Description

`activeTabId` holds one tab. `PLAY_AUDIO` overwrites it with whichever tab sent the message, and every `AUDIO_ENDED`, `AUDIO_ERROR` and `AUDIO_TIME` is relayed to that one tab only.

Start reading in a second tab and the first is orphaned mid-sentence: its toolbar still shows, its play button still says playing, but it will never receive the event that advances it. Meanwhile the single offscreen document has already swapped to the second tab's audio, so the first tab's paragraph was cut off with no explanation.

There is a genuine constraint underneath — one offscreen document, therefore one audio stream. Two tabs cannot read simultaneously and probably should not.

**Fix:** make taking over explicit rather than silent. When a second tab starts, tell the first to stop and tear its toolbar down, so the user sees reading move rather than a stalled toolbar lying about its state. Worth telling them why, briefly, on the tab that lost it.

A general audience will hit this quickly — opening a second article while the first is playing is an obvious thing to try.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Starting in a second tab stops the first cleanly
- [ ] The first tab's toolbar does not survive claiming to be playing
- [ ] The user is told why reading stopped there
- [ ] No orphaned audio or stranded relay state
- [ ] Closing the reading tab still tears the offscreen document down

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03

- **Note:** Item created
