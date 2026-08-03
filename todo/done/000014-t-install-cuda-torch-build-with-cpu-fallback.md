# Install CUDA torch build with CPU fallback

**Type:** 🔧 Task
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`uv sync` resolves torch from PyPI, which serves the CPU-only wheel — the installed build is `2.10.0+cpu` with `torch.version.cuda == None`. So `torch.cuda.is_available()` is False and the server logs `Using device: cpu` even on a machine with an RTX 4070 Ti SUPER, making synthesis slow enough that the first paragraph takes noticeably long to start.

The CUDA wheel has to be selected at install time from PyTorch's own index; it cannot be chosen at runtime. Fortunately a CUDA build runs fine on a machine with no GPU — it just reports `cuda.is_available() == False` — so one wheel covers both cases and the existing runtime check is the fallback.

torch 2.10.0 has cp313 win_amd64 wheels on cu126, cu128 and cu130. Using **cu128**: it fully supports Ada Lovelace (the 4070 Ti SUPER is compute 8.9), the local driver 610.47 is far above its floor, and it stays compatible with older drivers if the repo is used elsewhere. macOS has no CUDA wheels and must keep resolving from PyPI.

Fallback should also be legible rather than silent. The current one-liner cannot distinguish "no GPU on this machine" from "a CPU-only wheel got installed" — which is exactly the trap that hid this.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] `uv sync` installs a CUDA build of torch on Windows and Linux
- [ ] macOS still resolves torch from PyPI
- [ ] Server runs on GPU when one is present
- [ ] Server still runs on a machine with no GPU, falling back to CPU
- [ ] Startup log distinguishes "no CUDA device" from "CPU-only wheel installed"
- [ ] README documents the CPU-only install for anyone who wants it

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

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
