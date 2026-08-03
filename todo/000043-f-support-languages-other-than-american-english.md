# Support languages other than American English

**Type:** ✨ Feature
**Status:** 📋 Backlog
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000037

## Description

Kokoro ships voices for several languages, and the server exposes English only — `VOICE_CATALOG` lists 21 voices, all `en-us` or `en-gb`, and the pipeline is hardcoded to American English. For a general audience that is a large fraction of potential users who cannot use this at all.

#000032 does the structural half of the work: deriving language from the voice and holding a pipeline per language rather than one global. Once that exists, adding a language is largely extending the catalogue, plus whatever G2P dependency it needs — several of Kokoro's languages want an extra package, which is a real install cost and interacts with #000026.

The genuinely new part is detection. Reading a French page with an English voice produces nonsense, so language should follow the document rather than a setting the user has to remember to change: `<html lang>` where present, falling back to detection from the extracted text. With a manual override, since `lang` attributes are wrong often enough to be untrustworthy.

Also worth handling: a page that is mostly one language with quotes in another. Probably out of scope for a first pass — per-document language is the useful step, per-paragraph is a refinement.


## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Voice catalogue extended beyond English
- [ ] Language picked from `<html lang>`, falling back to detection
- [ ] Manual override for when detection is wrong
- [ ] Popup groups voices by language
- [ ] Per-language G2P dependencies documented, and packaged per #000026
- [ ] Depends on the per-language pipelines from #000032

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Note:** Item created
