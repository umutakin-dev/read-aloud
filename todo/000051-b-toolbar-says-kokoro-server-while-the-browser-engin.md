# Toolbar says Kokoro · server while the browser engine downloads its model

**Type:** 🐛 Bug
**Status:** 📋 Backlog
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-11-23 12:26 UTC

**Parent:** 000024

## Description

Switching Engine to this browser in the popup leaves an open tab with the engine its last health check saw. The model download that follows shows its progress under a Kokoro · server label, until the first chunk arrives and the label corrects itself. Seen by Umut in Chrome on the Mac. ENGINE_PROGRESS only ever comes from the browser engine, so receiving it settles which engine is running.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] The label reads Kokoro · browser as soon as the model starts downloading or loading
- [ ] A test drives content.js through it with a stubbed chrome

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-23 12:26 UTC
- **Note:** Dedup: top matches were the 000026 and 000024 epics and 000038 (keyboard controls); none covers the engine label. Follow-up from 000046's Chrome verification.

### 2026-11-23 12:26 UTC

- **Note:** Item created
