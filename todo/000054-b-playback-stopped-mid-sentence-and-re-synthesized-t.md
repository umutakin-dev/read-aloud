# Playback stopped mid-sentence and re-synthesized the chunk on the browser engine

**Type:** 🐛 Bug
**Status:** 📋 Backlog
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-23 12:52 UTC

**Parent:** 000028

## Description

Seen by Umut in Firefox on the Mac, reading z.ai/blog/glm-5.4 at 2x on the browser engine: playback stopped mid-sentence in paragraph 14 and the chunk was synthesized again. That is the playChunkWithServer catch path: a playback error, a health check, Retrying, a full re-synthesis. What threw is unknown. Ruled out from Firefox 160's source: idle suspension of the background page, since every event and API call resets its idle timer.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ]

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-23 22:34 UTC
- **Note:** Possible cause, from 000059 (2026-11-24): Firefox throttles a hidden tab, and every sentence boundary goes through the tab. A stall there that hits the retry path would look like this stop and re-synthesis. Check tab.stall hidden=true in the next log of this.

### 2026-11-23 12:52 UTC
- **Note:** Waiting on 000052: catch the next occurrence in the debug log, then find the cause.

### 2026-11-23 12:52 UTC

- **Note:** Item created
