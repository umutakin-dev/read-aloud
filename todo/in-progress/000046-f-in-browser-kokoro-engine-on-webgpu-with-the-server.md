# In-browser Kokoro engine on WebGPU, with the server as an optional upgrade

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Roadmap:** 🎯 NOW 1
**Tracked In:** local
**Created:** 2026-11-16 08:43 UTC

**Parent:** 000024

## Description

Spike 000025 showed Kokoro runs correctly in Firefox on WebGPU fp32 at ~4x realtime after warm-up, once kokoro-js uses transformers.js 4.x rather than its bundle. Umut chose the hybrid route: the browser engine is the zero-install default, the local server is an optional upgrade for exact word highlighting and speed, and machines without WebGPU need the server, since WASM runs at 0.8x.

## Items

## Estimation

- **Start:** 2026-11-16
- **End:** 2026-11-17
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-16 09:24 UTC
- **End:**
- **Effort:**

## Requirements

- [x] Kokoro runs in the extension on WebGPU fp32 with kokoro-js unbundled + transformers.js 4.x, never the kokoro.web.js bundle
- [x] Model fetched and cached on first use, with visible progress; nothing bundled into the package
- [x] Warm-up synthesis at load so the first sentence is not ~10s
- [x] Sentence-exact highlighting, words estimated by phoneme weight with character fallback
- [ ] Server used instead when configured and reachable; exact word highlighting there
- [ ] No WebGPU and no server: a clear message, not WASM at 0.8x
- [ ] Works in Firefox; Chrome checked separately

## Checklist

- [x] Design/approach decided
- [x] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [x] Documentation updated

## Log

### 2026-11-16 12:56 UTC
- **Progress:** Verified by the user in Firefox: reads, highlights, cached reload says Loading not Downloading. Unit-tested only: engine choice with the server up, and the no-WebGPU message. Chrome not checked. PR opened.

### 2026-11-16 12:56 UTC
- **Progress:** ☑ Checked (Checklist): Documentation updated

### 2026-11-16 12:56 UTC
- **Progress:** ☑ Checked (Checklist): Implementation complete

### 2026-11-16 12:56 UTC
- **Progress:** ☑ Checked (Checklist): Design/approach decided

### 2026-11-16 12:56 UTC
- **Progress:** ☑ Checked (Requirements): Sentence-exact highlighting, words estimated by phoneme weight with character fallback

### 2026-11-16 12:56 UTC
- **Progress:** ☑ Checked (Requirements): Warm-up synthesis at load so the first sentence is not ~10s

### 2026-11-16 12:56 UTC
- **Progress:** ☑ Checked (Requirements): Model fetched and cached on first use, with visible progress; nothing bundled into the package

### 2026-11-16 12:56 UTC
- **Progress:** ☑ Checked (Requirements): Kokoro runs in the extension on WebGPU fp32 with kokoro-js unbundled + transformers.js 4.x, never the kokoro.web.js bundle

### 2026-11-16 11:25 UTC
- **Progress:** User saw the download message on every extension reload. transformers.js emits download/progress events for cache reads too, so the engine now checks Cache Storage for onnx/model.onnx and reports phase load instead.

### 2026-11-16 09:34 UTC
- **Progress:** First cut built and unit-tested (151 extension tests). Engine bundled from engine/ against onnxruntime-web 1.31 (build refuses older); runs in the player context in both browsers, lazily. Routing by engine setting auto/browser/server. Firefox event page stays alive through download and pauses because the toolbar's 15s HEALTH_CHECK poll is incoming traffic — which also means 000044's KEEPALIVE was redundant. Untested in a real browser yet.

### 2026-11-16 09:24 UTC

- **Progress:** Started work

### 2026-11-16 08:43 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 1 — Umut's chosen route out of spike 000025

### 2026-11-16 08:43 UTC

- **Note:** Item created
