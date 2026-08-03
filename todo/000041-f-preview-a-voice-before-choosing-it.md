# Preview a voice before choosing it

**Type:** ✨ Feature
**Status:** 📋 Backlog
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000037

## Description

The popup lists 21 voices by name and gender — Alloy, Aoede, Bella, Heart, Jessica, Kore — which say nothing about how any of them sounds. Choosing means saving, starting a reading, listening, and going back if it was wrong. Nobody will work through 21 voices that way, so most users will hear one voice forever and never learn they had a choice.

A play button beside the selector, synthesizing a fixed sample sentence. The server already does everything needed; this is a `/api/tts` call and an `<audio>` element in the popup.

Two details worth getting right. The sample should be long enough to judge — a single word is not enough to tell voices apart — and it should preview at the user's chosen speed, since a voice that is pleasant at 1x can be unusable at 2x. Caching samples avoids re-synthesizing the same sentence every time the popup opens.

Depends on #000032: previewing a British voice that is pronounced with American phonemes would be actively misleading, since the accent is exactly what is being judged.


## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Play button beside the voice selector
- [ ] Sample long enough to judge a voice by
- [ ] Preview uses the currently selected speed
- [ ] Samples cached rather than re-synthesized each time
- [ ] Degrades sensibly when the server is unavailable
- [ ] Preview reflects the voice's real accent, per #000032

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Note:** Item created
