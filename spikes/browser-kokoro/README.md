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

## The browser page

Answers what Node cannot: real WebGPU speed, and whether sentence-level
highlighting is tolerable to read along with.

```bash
cd page
npx serve            # or: python -m http.server 8000
```

Then open it and press **Load model**. ES modules will not load over `file://`,
so it has to be served. `kokoro-js` comes from jsDelivr via an import map, so
there is nothing to build.

The page reports model load time, time to first audio, and the realtime ratio
including playback — the last being the one that matters, since synthesis has to
outrun reading or every sentence stalls.

It also demonstrates the highlighting this option would ship with. **Sentence
highlights are exact**, from real audio boundaries. **Word highlights are
estimated**, splitting each sentence's measured duration across its words by
character length. Watching how far that drifts within a long sentence is the
whole point.

Weighting by phoneme count would track speech better than characters, but the
phoneme string is not reliably one group per word — `1990` becomes two — so it
needs an alignment step this page does not attempt.

## Numbers so far

| | |
|---|---|
| Node, CPU, q8 | **1.2x realtime** |
| Current server, CUDA | 16–80x realtime |
| Browser, WebGPU | *unmeasured — run the page* |

At 1.2x, a 25-second paragraph takes ~20 seconds to synthesize and prefetch can
never get ahead. WebGPU has to close most of that gap for this option to be
viable at all.
