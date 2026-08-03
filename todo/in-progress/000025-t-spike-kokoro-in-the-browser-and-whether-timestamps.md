# Spike Kokoro in the browser and whether timestamps survive

**Type:** 🔧 Task
**Status:** 🔨 In Progress
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

## Findings

`kokoro-js` (1.2.1, Apache-2.0, published by hexgrad — the author of Kokoro
itself) wraps `onnx-community/Kokoro-82M-v1.0-ONNX` via transformers.js. It
depends on `@huggingface/transformers` and `phonemizer`, and nothing else.

### Timestamps are gone, and cannot be reconstructed

This is the answer that decides it.

- `generate()` returns a `RawAudio` whose only keys are `audio` and
  `sampling_rate`
- `stream()` yields `{ text, phonemes, audio }` — per *sentence*, with no
  word-level timing
- **The ONNX graph itself emits a single output, `waveform`**, dims `[1, N]`

That last point is what makes this final. In Python, Kokoro's timestamps come
from the duration predictor, which `join_timestamps` maps back onto tokens. The
ONNX export does not expose durations at all, so this is not "kokoro-js did not
bother to surface them" — the data is not in the graph. Reconstructing word
timings client-side is not possible without a different export.

Verified by calling the model directly rather than through the wrapper.

### Speed is a second, independent problem

**1.2x realtime**, q8, CPU, via onnxruntime-node. For comparison the current
server does 16–80x on this GPU, and even CPU-Python managed ~4x.

At 1.2x a 25-second paragraph takes ~20 seconds to synthesize, so prefetch can
never get ahead — every paragraph would stall. WebGPU may change this
substantially and is unmeasured; WASM, the floor, will be worse than the number
above rather than better.

### Everything else is good news

- **No espeak-ng.** `phonemizer` is pure JS, removing a manual install step
  that is currently a documented prerequisite.
- **28 voices**, against the 21 in our catalogue — adds Fenrir, Puck, Santa,
  Alice, Lily, Daniel, Fable. Same two languages, `en-us` and `en-gb`.
- **Model sizes** on the ONNX repo: 82MB (q8f16), 88MB (quantized/q8), 109MB
  (uint8f16), 147MB (q4f16), 156MB (fp16), 310MB (fp32).
- Fetched from HuggingFace at runtime and cached; voices are cached separately
  in a `kokoro-voices` Cache Storage bucket. Nothing needs bundling into the
  extension, which avoids a large package and its review implications.

### Recommendation

The browser path costs word-level highlighting. That is the feature this
extension was built around, so it is not a detail to trade away quietly — the
decision belongs to Umut, not to this spike.

Three routes:

1. **Keep the server, fix distribution instead** (#000026). Retains exact
   timestamps and GPU speed. Costs a per-platform installer.
2. **Browser-only, sentence-level highlighting.** `stream()` gives accurate
   per-sentence boundaries for free; words within a sentence could be
   approximated by character proportion. Honest degradation rather than the
   silent drift of #000004, but visibly coarser.
3. **Hybrid.** Browser as the zero-install default, server as an optional
   upgrade for word highlighting and speed. Best experience, most code, two
   paths to maintain.

Measuring WebGPU is only worth doing under 2 or 3. Under 1 it is wasted work.

## Requirements

- [x] Kokoro produces audio from this repo — via kokoro-js in Node
- [x] Answered: per-token timestamps are **not available** and not
      reconstructible, since the ONNX graph emits only `waveform`
- [x] Measured: 82–310MB depending on precision, fetched and cached at runtime
- [x] Measured: 1.2x realtime on CPU (q8). WebGPU unmeasured — needs a browser
- [x] Established: G2P no longer needs espeak-ng, `phonemizer` is pure JS
- [x] Established: the model is fetched rather than bundled, so packaging is
      not a constraint
- [x] Written recommendation — see above; the choice needs Umut

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03
- **Decision:** Per-token timestamps do not survive the port to kokoro-js, and cannot be reconstructed: the ONNX graph emits only 'waveform', so the duration predictor output that Python Kokoro turns into start_ts/end_ts via join_timestamps is not exported at all. Verified by calling the model directly rather than through the wrapper. Browser-side synthesis therefore costs word-level highlighting — the feature the extension was built around — so the route is Umut's decision, not the spike's.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
