# British voices are pronounced with American phonemes

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000028

## Description

`tts_engine.py` builds the pipeline once, hardcoded:

```python
self._pipeline = KPipeline(lang_code="a", device=device)
```

`"a"` is American English. But `VOICE_CATALOG` offers four British voices — `bf_emma`, `bf_isabella`, `bm_george`, `bm_lewis` — all of them documented as `en-gb` in the API response the popup displays. Kokoro's `lang_code` selects the grapheme-to-phoneme conversion, so those voices are being handed American phonemes.

The result is a British voice reading American pronunciation. Not broken, which is why it went unnoticed, but wrong in a way anyone picking George specifically for a British accent will notice.

**Fix:** derive the language from the voice prefix — `a*` American, `b*` British — and keep a pipeline per language rather than one global. That means holding more than one in memory, so they should be created lazily on first use of a voice in that language rather than all up front.

This overlaps with #000043; doing it properly here makes that mostly a matter of extending the catalogue.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Language derived from the voice, not hardcoded
- [ ] Pipelines cached per language and created on first use
- [ ] A British voice is pronounced with British phonemes
- [ ] Startup does not pay for languages nobody selects
- [ ] Log line names the language alongside the voice

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03
- **Progress:** Language is derived from the voice id prefix and a pipeline is held per language, created on first use. Verified against the real engine: the British pipeline is built lazily when bm_george is first requested, and the same sentence renders 4.25s as af_heart against 4.90s as bm_george — the phonemes genuinely differ rather than the voice being relabelled. Catalogue moved to voices.py so it can be tested without torch; a test asserts the catalogue's language agrees with the prefix, since the popup shows one and synthesis follows the other.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
