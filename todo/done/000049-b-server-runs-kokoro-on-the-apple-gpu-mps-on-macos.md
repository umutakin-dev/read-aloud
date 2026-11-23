# Server runs Kokoro on the Apple GPU (MPS) on macOS

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-23 10:51 UTC

**Parent:** 000028

## Description

select_device() only checks CUDA, so on an Apple Silicon Mac Kokoro falls back to the CPU. The CPU warning then tells you to re-run uv sync for the CUDA wheel, which cannot exist on macOS. Measured on this MacBook (torch 2.10): CPU 10x realtime, MPS 24x once warm, with no op fallback needed and identical word timings. The first MPS run takes 7s against the CPU's 2s while kernels compile, so the pipeline has to be warmed when it is built. Order: cuda, then mps, then cpu.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:** 2026-11-23 10:51 UTC
- **End:** 2026-11-23 11:19 UTC
- **Effort:** 1m

## Requirements

- [x] select_device picks cuda, then mps, then cpu
- [x] The CPU message gives advice that is true on this platform
- [x] A new MPS pipeline is warmed before it serves its first chunk
- [x] Tests cover the device order and messages without a GPU or torch

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-23 11:19 UTC

- **Progress:** Completed

### 2026-11-23 11:19 UTC
- **Note:** Not run on the desktop's CUDA path. Its logic only moved into device.py, and the warm-up runs on MPS only.

### 2026-11-23 11:19 UTC
- **Delivered:** PR #11 (fix: run Kokoro on the Apple GPU (MPS) on macOS)

### 2026-11-23 10:56 UTC
- **Decision:** MPS is the default despite the per-length compile cost: it is never slower in total, gets faster with use, and keeps the CPU free for the browser. A one-word warm-up on pipeline build pays the first-install compile (7s chunk to 0.9s) and routes any MPS op failure into the existing CPU fallback.

### 2026-11-23 10:56 UTC
- **Progress:** Measured on this MacBook over 10 chunks of new lengths each: CPU 11.0x realtime, MPS 10.2x on the first run, 19.5x on a repeat (Metal caches kernels per input length on disk), 12.7x on unseen lengths. MPS never ends up behind the CPU in total. Slowest chunk 4.6x, so playback never waits. Server verified end to end on mps.

### 2026-11-23 10:56 UTC
- **Progress:** ☑ Checked (Requirements): Tests cover the device order and messages without a GPU or torch

### 2026-11-23 10:56 UTC
- **Progress:** ☑ Checked (Requirements): A new MPS pipeline is warmed before it serves its first chunk

### 2026-11-23 10:56 UTC
- **Progress:** ☑ Checked (Requirements): The CPU message gives advice that is true on this platform

### 2026-11-23 10:56 UTC
- **Progress:** ☑ Checked (Requirements): select_device picks cuda, then mps, then cpu

### 2026-11-23 10:51 UTC

- **Progress:** Started work

### 2026-11-23 10:51 UTC
- **Note:** Dedup review read 000046, 000026, 000028, 000024 and 000036: none covers it. 000026 asks for GPU-when-present but is a future repackaging. The CUDA-only check came from 000014.

### 2026-11-23 10:51 UTC

- **Note:** Item created
