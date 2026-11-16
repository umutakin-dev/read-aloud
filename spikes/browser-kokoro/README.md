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

One gotcha worth recording: **passing a bare string to `tts.stream()` hangs.**
It builds a `TextSplitterStream` internally but never closes it, so the final
sentence is never flushed and the iterator waits forever. Construct the
splitter yourself, `push()`, then `close()`.

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
estimated**, splitting each sentence's measured duration across its words.
Watching how far that drifts within a long sentence is the whole point.

## Weighting words: characters or phonemes

Duration follows sounds rather than spelling, so phoneme counts should estimate
better than character counts. `stream()` returns the phoneme string per
sentence, whitespace-separated roughly per word — but only roughly, because
Kokoro normalizes before phonemizing and that moves in **both** directions:

| text | phonemes | |
|---|---|---|
| `1990` | `nˈaɪntiːn nˈaɪndi` | one word becomes two groups |
| `3:45` | `θɹˈiː fˈoːɹɾi fˈaɪv` | one becomes three |
| `that the` | `ðætðə` | two words merge into one |

Measured over eight sentences, **five aligned one to one** — and the three that
did not were chosen deliberately to break it. Ordinary prose aligns; numbers,
times, currency and abbreviations do not.

So the page weights by phonemes when the counts line up and falls back to
characters when they do not, rather than guessing an alignment. It reports the
hit rate, and the estimator is switchable so the two can be compared on the
same sentence.

Stress marks and punctuation carry no weight — they are not sounds. The length
mark `ː` does, since it genuinely means a longer vowel.

On a four-second sentence the two estimators put a word start up to **0.26s**
apart, so the choice is not cosmetic.

## Numbers so far

| | |
|---|---|
| Current server, CUDA | **16–80x** realtime |
| Node, CPU, q8 | **1.2x** realtime |
| Browser, WebGPU, **q8** | **~0.4x** realtime — and audibly wrong |
| Firefox 160, WebGPU, fp32 | **static** — wrong output, not a speed problem |
| Firefox 160, WebGPU, fp16 | **silence** |
| Firefox 160, WASM, q8, plain `http.server` | **0.5x** — single-threaded, no isolation |
| Firefox 160, WASM, q8, `serve.py` (COOP/COEP) | **0.8x** — load 1.0s cached, first audio 4.4s |

The isolated run's own log was cleared by pressing Read, so it is unconfirmed
whether threads were actually on. It does not change the answer: native,
multi-threaded onnxruntime in Node is the ceiling WASM approaches, and that was
1.2x.

### Firefox, 2026-11-16

WebGPU is not slow on Firefox, it is **wrong**: onnxruntime-web produces static
at fp32 and nothing at fp16. WASM produces correct audio at 0.5–0.8x, so a
27.5s passage took 62–85s of wall clock. Synthesis falls behind listening on
every sentence, and no amount of prefetch fixes a rate below 1x.

Serve with `python serve.py` rather than `http.server`. Without COOP/COEP the
page is not cross-origin isolated and WASM silently runs on one thread.

Prefetch needs synthesis to outrun playback. Below 1x it can never catch up and
every sentence stalls; a comfortable margin is more like 3x.

### q8 on WebGPU is not a fair test

The first run used q8 because it is the smallest download. That was a bad
default. Quantized weights on WebGPU dequantize constantly, which is slow, and
int8 damages a TTS model enough that the output stopped sounding like English
at all. Both symptoms have the same cause.

fp32 or fp16 are the WebGPU choices; q8 belongs to WASM. The page now defaults
to fp32 and warns if you pair a quantized weight set with WebGPU.

### On the realtime figure

The first version of this page reported synthesis and playback together, which
made the ratio meaningless — playing N seconds of audio takes N seconds, so
combining them caps the number at 1.0 however fast the model is. Synthesis is
now timed separately, with wall clock reported alongside it.
