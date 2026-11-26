# Reading in a second tab silently breaks the first

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
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
- **Effort:** ~13m (p75 1h12)

## Actual

- **Start:** 2026-11-26 22:27 UTC
- **End:**
- **Effort:**

## Requirements

- [x] Starting in a second tab stops the first cleanly
- [x] The first tab's toolbar does not survive claiming to be playing
- [x] The user is told why reading stopped there
- [x] No orphaned audio or stranded relay state
- [x] Closing the reading tab still tears the offscreen document down
- [ ] Verified in Chrome and Firefox: start a second tab mid-sentence and the first stops and says so

## Checklist

- [x] Reproduced
- [x] Root cause identified
- [x] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [x] Regression tested

## Log

### 2026-11-26 22:31 UTC
- **Progress:** PR #35 opened (one tab reads at a time; the old tab stops and says reading moved). 404 extension tests pass. Left open for the check in Chrome and Firefox.

### 2026-11-26 22:31 UTC
- **Note:** Reproduced from the code, not in a browser: activeTabId moved to whichever tab sent PLAY_AUDIO, and the old tab's Stop on the way out would also have stopped the new tab's audio once that was fixed. The browser check is the last requirement.

### 2026-11-26 22:31 UTC
- **Decision:** Takeover is owned by the background. A tab sends READING_STARTED once it has text to read; the background stops the player and sends READING_MOVED to the tab that was reading, then refuses player messages from any tab but the reading one (the old tab's own Stop would otherwise cut off the new tab). The old tab keeps only its status line and Close, saying reading moved; the notice closes 6s after the tab is next shown.

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Checklist): Regression tested

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Checklist): Fix implemented

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Checklist): Root cause identified

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Checklist): Reproduced

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Requirements): Closing the reading tab still tears the offscreen document down

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Requirements): No orphaned audio or stranded relay state

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Requirements): The user is told why reading stopped there

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Requirements): The first tab's toolbar does not survive claiming to be playing

### 2026-11-26 22:31 UTC
- **Progress:** ☑ Checked (Requirements): Starting in a second tab stops the first cleanly

### 2026-11-26 22:27 UTC

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
