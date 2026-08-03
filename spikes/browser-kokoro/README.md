# Spike: Kokoro in the browser

Answers `todo/000025` — whether the local Python server can be replaced by
running Kokoro client-side, and specifically **whether per-token timestamps
survive the port**, since word-level highlighting rests entirely on them.

```bash
npm install
npm run spike        # downloads ~88MB of model on first run
```

Not part of the test suite and not run in CI. Kept because the conclusion is
load-bearing for the roadmap, and a claim this consequential should be
reproducible rather than taken on trust.

## Conclusion

**Timestamps do not survive, and cannot be reconstructed.**

`generate()` returns only `{ audio, sampling_rate }`. `stream()` adds sentence
text and phonemes, but no word timing. Decisively, calling the ONNX model
directly shows the graph emits a **single output, `waveform`** — the duration
predictor's output, which Python Kokoro turns into `start_ts`/`end_ts` via
`join_timestamps`, is not exported at all.

So this is not a wrapper omission that could be worked around. Word timings
would need a different ONNX export.

Secondary findings, and the full recommendation, are in the todo item.

## What is still unmeasured

Synthesis ran at **1.2x realtime** on CPU under `onnxruntime-node`, against
16–80x for the current GPU server. WebGPU in a real browser is unmeasured and
could be substantially faster; WASM would be slower.

That measurement is only worth taking if word-level highlighting is being given
up, so it waits on that decision.
