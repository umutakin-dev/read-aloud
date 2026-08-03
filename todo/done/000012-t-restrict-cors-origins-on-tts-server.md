# Restrict CORS origins on TTS server

**Type:** 🔧 Task
**Status:** ✅ Done
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`main.py:16-22` configures `CORSMiddleware` with `allow_origins=["*"]` and `allow_credentials=True`, so any website the user happens to be browsing can POST to the local TTS server and drive the GPU.

Low stakes — the server binds to localhost and only synthesizes speech — but it is free to close, and the current `["*"] + allow_credentials` pairing is invalid per the CORS spec anyway (Starlette papers over it by echoing the request origin).

**Fix:** restrict to the extension origin. Since the extension ID is not stable for an unpacked load, accept an allowed-origins list from an env var with a sensible default, and document it in the README.

Depends on #000007 — tightening this will break custom server URLs unless the host permission work lands with it.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Allowed origins configurable via env var, restricted by default
- [ ] `allow_credentials` set consistently with the origin policy
- [ ] README documents how to allow the extension's origin
- [ ] Extension still reaches the server after the change

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** 7ed98e8 (fix: restrict CORS, request host permission, correct timestamp fallback)

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
