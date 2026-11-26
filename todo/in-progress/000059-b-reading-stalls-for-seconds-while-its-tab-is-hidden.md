# Reading stalls for seconds while its tab is hidden, because the tab chooses each next sentence

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Roadmap:** 🎯 NOW 2
**Tracked In:** local
**Created:** 2026-11-23 22:34 UTC

**Parent:** 000028

## Description

Firefox throttles a tab that is not showing, scripts and message handling included. Umut's logs, 2026-11-24, Hacker News on the browser engine:
- a 6.3s silence mid-read (`gapMs=6290`) while he glanced at another tab
- `chunk.ready` arriving 16s and 23s after synthesis while he was in `about:addons`

He confirmed he was on another tab each time.

Every sentence boundary goes through the reading tab: the player reports AUDIO_ENDED, the tab picks the next sentence and sends PLAY. So a hidden tab stalls the audio, and listening while reading something else is a main use.

**Fix:** the player advances to the next sentence it already has preloaded by itself, then tells the tab, which only needs to keep up for highlighting.

## Estimation

- **Start:** 2026-11-24
- **End:** 2026-11-25
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-24 07:15 UTC
- **End:**
- **Effort:**

## Requirements

- [ ] With the tab hidden, sentences follow each other with no audible gap, in Firefox and Chrome
- [x] The player starts the preloaded next sentence itself, then tells the tab
- [x] Pause, stop, jumps and a voice change still win over an advance already under way
- [ ] Highlighting catches up when the tab is shown again
- [ ] tab.stall in the debug log shows hidden=true during a test, with gapMs still small

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-26 07:01 UTC
- **Note:** Code merged ahead of the browser check, since the PRs above it are stacked on it. Umut's Chrome log (2026-11-26) shows every boundary advanced=true with gapMs 0-3, but the tab was never hidden. Left open for: a read with the tab hidden in Firefox and Chrome, and highlighting catching up when it is shown again.

### 2026-11-24 07:19 UTC
- **Progress:** Built: player queue of up to 8 preloads, self-advance with AUDIO_ENDED advancedTo, tab follows without PLAY; keyed AUDIO_TIME/AUDIO_ENDED. 322 extension tests pass; the new tab tests fail on the old code. Waiting on Umut: read with the tab hidden in Firefox and Chrome, then a log with tab.stall hidden=true and small gapMs.

### 2026-11-24 07:19 UTC
- **Progress:** ☑ Checked (Requirements): Pause, stop, jumps and a voice change still win over an advance already under way

### 2026-11-24 07:19 UTC
- **Progress:** ☑ Checked (Requirements): The player starts the preloaded next sentence itself, then tells the tab

### 2026-11-24 07:15 UTC

- **Progress:** Started work

### 2026-11-23 22:34 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 2

### 2026-11-23 22:34 UTC
- **Note:** Dedup: read 000033 (a second tab orphans the first), 000054 (a stop mid-sentence and re-synthesis) and 000056 (audio outliving a reload). None covers a hidden tab throttling playback. 000054 may share the cause; noted there.

### 2026-11-23 22:34 UTC

- **Note:** Item created
