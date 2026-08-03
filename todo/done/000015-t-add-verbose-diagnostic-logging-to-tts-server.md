# Add verbose diagnostic logging to TTS server

**Type:** 🔧 Task
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

The server currently logs only uvicorn's access lines, so a request is a bare `POST /api/tts-with-timestamps 200 OK` with nothing about what was synthesized or how it went. That is not enough to diagnose the highlighting behaviour reported against #000003 / #000004 from the server side.

The single most valuable signal is the **token alignment rate** from `align_timestamps_to_text`. Every token it cannot locate in the request text is a word the client has to estimate a position for, so a low rate is a direct predictor of the highlight drifting — and right now it is completely invisible.

Also worth surfacing per request: text length and preview, whether timings came from Kokoro tokens or the estimated fallback, chunk and token counts, synthesis wall time and realtime factor, and audio duration. At startup: torch version, CUDA build, device, and GPU name.

Verbosity should be controllable so normal use stays quiet.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Log level configurable via env var, default stays readable
- [ ] Startup logs torch version, CUDA build, selected device and GPU name
- [ ] Each request logs voice, speed, text length and a preview
- [ ] Each request logs token alignment rate, and warns when it is poor
- [ ] Each request logs whether timings came from tokens or the fallback
- [ ] Each request logs synthesis time, audio duration and realtime factor
- [ ] Unaligned words listed at debug level for diagnosis

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** 363a4eb (feat: run Kokoro on GPU, add diagnostic logging)

### 2026-08-03

- **Note:** Item created
