# Debug log the extension records and the popup downloads

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Roadmap:** 🎯 NOW 1
**Tracked In:** local
**Created:** 2026-11-23 12:52 UTC

**Parent:** 000028

## Description

Umut asked for the extension to record its own log instead of asking him to open consoles after the fact (000054 is the first case). The background script keeps a capped ring buffer in extension storage; the tab, the player and the browser engine send it events. Events, not content: chunk requested, synthesized by which engine in how long, played, ended, errors, retries, health, engine load, with at most a short text preview. The popup downloads it. Nothing leaves the machine.

## Items

## Estimation

- **Start:** 2026-11-23
- **End:** 2026-11-24
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-23 12:53 UTC
- **End:**
- **Effort:**

## Requirements

- [x] Tab, background, player and browser engine each log to one ring buffer kept by the background
- [x] The buffer survives a background restart and is capped by entry count
- [x] Errors, retries, synthesis timings and playback start/end/stall are logged with chunk index and engine
- [x] The popup has a Download debug log button that saves a text file
- [x] No page text beyond a short preview per event; nothing is sent anywhere
- [x] Tests cover the buffer and each part's logging

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-23 12:59 UTC
- **Progress:** Built and tested (190 extension tests). The Firefox test caught offscreen.js and background.js sharing one global scope: the player's log helper was silently replaced by the background's, so it is playerLog. Not yet seen in a real browser: the download from the popup in both browsers.

### 2026-11-23 12:59 UTC
- **Progress:** ☑ Checked (Requirements): Tests cover the buffer and each part's logging

### 2026-11-23 12:59 UTC
- **Progress:** ☑ Checked (Requirements): No page text beyond a short preview per event; nothing is sent anywhere

### 2026-11-23 12:59 UTC
- **Progress:** ☑ Checked (Requirements): The popup has a Download debug log button that saves a text file

### 2026-11-23 12:59 UTC
- **Progress:** ☑ Checked (Requirements): Errors, retries, synthesis timings and playback start/end/stall are logged with chunk index and engine

### 2026-11-23 12:59 UTC
- **Progress:** ☑ Checked (Requirements): The buffer survives a background restart and is capped by entry count

### 2026-11-23 12:59 UTC
- **Progress:** ☑ Checked (Requirements): Tab, background, player and browser engine each log to one ring buffer kept by the background

### 2026-11-23 12:53 UTC

- **Progress:** Started work

### 2026-11-23 12:53 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 1 — Umut's order, 2026-11-23: the log first, then the record, then the selection jump

### 2026-11-23 12:52 UTC

- **Note:** Item created
