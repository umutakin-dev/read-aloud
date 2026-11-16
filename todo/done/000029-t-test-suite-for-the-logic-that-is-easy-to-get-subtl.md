# Test suite for the logic that is easy to get subtly wrong

**Type:** 🔧 Task
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000028

## Description

There are no tests. No `package.json`, no test directory, no CI. The 22 fixes in #000001 were each verified by hand and by scripts written into a scratchpad and thrown away, so nothing in the repository stops any of them regressing.

The tests largely exist already — they just need to move into the repo and be made runnable. Written during the review:

- whitespace collapsing in `buildTextIndex` matching what `splitIntoParagraphs` produces, across ten node layouts including the `["foo", " ", "bar"]` case that used to splice words together
- `splitAroundUrls` across eight URL shapes, asserting the invariant that makes highlighting work: every chunk stays an exact run of the page text
- chunk-to-paragraph mapping and prev/next semantics, including that walking Next visits every paragraph exactly once
- `align_timestamps_to_text` against punctuation tokens, contractions, repeated words and unfindable rewrites
- the CORS policy through real Starlette, confirming extension origins pass and `https://evil.example` does not
- the offscreen preload handshake, including that object URLs do not accumulate
- orphan detection across every shape an invalidated extension context takes

`node --test` and `pytest` cover all of it with no new dependencies. The awkward parts are the ones needing a DOM (`buildTextIndex`, `paragraphsFromRoot`) — the review used a hand-rolled element stub, which works but is fragile; jsdom is probably the right answer.

What this cannot cover is the integration: injection, offscreen playback, service-worker eviction. That wants Playwright driving a real Chrome, and is worth a follow-up once the unit layer exists.

## Estimation

- **Effort:** 2-3 hours for the unit layer

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] `npm test` runs the JavaScript suite
- [ ] `pytest` runs the Python suite
- [ ] Every scratchpad check from #000001 is represented
- [ ] Pure functions are exported in a way tests can reach without loading the extension
- [ ] DOM-dependent tests use jsdom rather than a hand-rolled stub
- [ ] A regression of any #000001 fix fails the suite
- [ ] README says how to run them

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** 7da70b0 (test: add the test suite, CI, and a roadmap toward release, PR #3)

### 2026-08-03
- **Note:** Extracting alignment.py surfaced a latent shadowing bug: the prune left a second definition of align_timestamps_to_text in tts_engine.py that overrode the import. Caught by the failing test rather than by inspection, which is the point of the exercise.

### 2026-08-03
- **Progress:** Extracted the pure logic into extension/lib/textkit.js and server/src/tts_server/alignment.py so tests can reach it without loading the extension or importing torch. 91 JS tests via node --test with jsdom, 23 Python tests via pytest. background.js and offscreen.js are loaded whole under stubs rather than having pieces extracted from them, so the tests break when those files change.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
