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
| Node, CPU, q8 | **1.2x realtime** |
| Current server, CUDA | 16–80x realtime |
| Browser, WebGPU | *unmeasured — run the page* |

At 1.2x, a 25-second paragraph takes ~20 seconds to synthesize and prefetch can
never get ahead. WebGPU has to close most of that gap for this option to be
viable at all.
