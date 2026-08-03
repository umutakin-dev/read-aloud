# Server word-timestamp fallback mis-estimates timing

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

The no-token fallback in `synthesize_with_timestamps` (`tts_engine.py:101-111`) is wrong for multi-chunk input:

```python
words = text.split() if not audio_chunks else result.graphemes.split()
```

On the first chunk, `audio_chunks` is empty, so it takes the *entire* request text's word list and spreads it across only that chunk's duration. Every subsequent chunk then re-emits words that were already timestamped, so the returned list is both wrong and longer than the text.

It also reaches for `result.graphemes` without checking the attribute exists, so the fallback path can raise on a Kokoro version that does not expose it.

**Fix:** always use the current chunk's own graphemes, guard the attribute access, and skip timestamp emission entirely if neither tokens nor graphemes are available rather than emitting bad data.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Fallback uses the current chunk's graphemes, never the whole request text
- [ ] `result.graphemes` access is guarded
- [ ] No timestamps emitted (rather than wrong ones) when neither source is available
- [ ] Multi-chunk input produces a monotonic, non-duplicated timestamp list

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** 7ed98e8 (fix: restrict CORS, request host permission, correct timestamp fallback)

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
