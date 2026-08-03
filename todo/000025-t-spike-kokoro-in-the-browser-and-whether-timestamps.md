# Spike Kokoro in the browser and whether timestamps survive

**Type:** 🔧 Task
**Status:** 📋 Backlog
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000024

## Description

Kokoro 82M has ONNX ports that run under transformers.js / ONNX Runtime Web, with WebGPU where available and WASM as a floor. If one of them works here, the entire server disappears — no Python, no uv, no espeak-ng, no port, no CORS policy, no host permissions, no health polling, no service-worker relay. That is the difference between a developer tool and something a general user can install in one click.

**The question that decides it: do those ports expose per-token timestamps?**

The whole highlighting design rests on Kokoro's `start_ts`/`end_ts` per token, which `align_timestamps_to_text` turns into character spans. If the JS port returns audio only, word highlighting either disappears or falls back to estimating positions from word lengths — which is precisely the drift #000004 was fixed to eliminate. Losing it would trade the flagship feature for the install story.

Also worth measuring, since they decide whether it is usable rather than merely possible: model download size on first run and where it is cached, synthesis speed on WASM (the floor, not the WebGPU best case), whether grapheme-to-phoneme still needs espeak or ships in the bundle, and whether a large model file can even be packaged in an extension or has to be fetched — which has Web Store review implications of its own.

Timebox this. The output is an answer and a recommendation, not working code.

## Estimation

- **Effort:** half a day

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Kokoro produces audio in a browser page from this repo
- [ ] Answered: are per-token timestamps available, and how accurate
- [ ] Measured: first-run download size and where it is cached
- [ ] Measured: synthesis speed on WASM, and on WebGPU if available
- [ ] Established: does G2P still need espeak-ng
- [ ] Established: can the model ship in the extension or must it be fetched
- [ ] Written recommendation — browser, packaged server, or stay as is

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Note:** Item created
