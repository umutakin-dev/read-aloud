# Without WebGPU, read with the system voice instead of nothing

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-11-26 09:52 UTC

**Parent:** 000024

## Description

A browser without WebGPU (Firefox on Linux, for one) cannot run the in-browser Kokoro engine, and with no server running the toolbar just says No engine: nothing is ever read. Browser speech is opt-in (000018), which was right when the only engine was a server that might be started any moment, but here no Kokoro will ever come.

Umut, 2026-11-26: fall back automatically. When the browser engine is unsupported for want of WebGPU, and the engine setting is not server-only, read with the system voice and say why in the toolbar; switch to Kokoro if a server appears. A server that is merely down, with the setting on server, still waits.

## Items

## Estimation

- **Start:**
- **End:**
- **Effort:** ~19m (p75 57m)

## Actual

- **Start:** 2026-11-26 09:52 UTC
- **End:**
- **Effort:**

## Requirements

- [ ]

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-26 09:54 UTC
- **Progress:** PR #32 opened: noKokoro in the health answer, system voice used where Kokoro cannot run, hand-over to Kokoro at the next sentence. Not yet tried in a browser without WebGPU.

### 2026-11-26 09:52 UTC

- **Progress:** Started work

### 2026-11-26 09:52 UTC

- **Note:** Item created
