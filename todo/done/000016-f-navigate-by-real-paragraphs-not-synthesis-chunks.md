# Navigate by real paragraphs, not synthesis chunks

**Type:** ✨ Feature
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`splitIntoParagraphs` returns one flat array conflating two different things: real paragraphs, and the ≤500-character pieces long paragraphs get cut into so Kokoro can synthesize them. Everything downstream treats an entry as "a paragraph", so the toolbar reads `Paragraph 1/366` on a Stanford Encyclopedia entry and prev/next step by synthesis chunk.

Both units are needed — the 500-character cap keeps synthesis responsive and lets prefetch stay ahead — but only one belongs in the UI. A reader pressing Next means "skip this paragraph", not "skip the next 1.7 sentences".

**Approach:** keep a flat chunk list for playback and prefetch, since both want a linear sequence with global indices, but record which paragraph each chunk belongs to and where each paragraph starts:

- `state.chunks` — `[{ text, paragraph }]`, the synthesis units, played in order
- `state.paragraphStarts` — chunk index where each real paragraph begins
- `state.currentChunk` — global chunk index, what playback advances
- current paragraph is `state.chunks[currentChunk].paragraph`

Prev/next then jump to `paragraphStarts[p ± 1]` and the toolbar counts real paragraphs. Playback still flows chunk to chunk, crossing paragraph boundaries without a gap.

Highlighting is unaffected: it resolves per chunk, and a chunk is still a contiguous whitespace-collapsed substring of the page text.


## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Toolbar counts real paragraphs, not synthesis chunks
- [ ] Prev/next move a whole paragraph regardless of how many chunks it holds
- [ ] Playback crosses chunk boundaries within a paragraph without a gap
- [ ] Prefetch still works across chunk and paragraph boundaries
- [ ] Highlighting still resolves per chunk

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** 542b3e2 (feat: navigate by paragraph, resume after offscreen teardown, show engine)

### 2026-08-03
- **Progress:** Verified: the toolbar counts real paragraphs — Paragraph 3/198 on a Hacker News thread — rather than the synthesis chunks it used to report.

### 2026-08-03

- **Note:** Item created
