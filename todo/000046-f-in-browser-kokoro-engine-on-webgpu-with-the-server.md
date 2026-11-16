# In-browser Kokoro engine on WebGPU, with the server as an optional upgrade

**Type:** ✨ Feature
**Status:** 📋 Backlog
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

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Kokoro runs in the extension on WebGPU fp32 with kokoro-js unbundled + transformers.js 4.x, never the kokoro.web.js bundle
- [ ] Model fetched and cached on first use, with visible progress; nothing bundled into the package
- [ ] Warm-up synthesis at load so the first sentence is not ~10s
- [ ] Sentence-exact highlighting, words estimated by phoneme weight with character fallback
- [ ] Server used instead when configured and reachable; exact word highlighting there
- [ ] No WebGPU and no server: a clear message, not WASM at 0.8x
- [ ] Works in Firefox; Chrome checked separately

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-16 08:43 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 1 — Umut's chosen route out of spike 000025

### 2026-11-16 08:43 UTC

- **Note:** Item created
