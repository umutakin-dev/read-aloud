# Make browser TTS fallback opt-in, off by default

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

When the Kokoro server is unreachable the extension silently switches to the browser's built-in speech. For anyone using this *because* of Kokoro's voice quality, that is not a graceful degradation — it is an unwanted substitution, and the whole reason to run a local GPU model is to not hear it.

Fallback becomes an explicit setting, **off by default**. With it off and the server unavailable, the extension says so and waits rather than reading in a voice the user did not ask for.

Waiting is the right behaviour rather than stopping: the toolbar is open because the reader wants to read, and the most likely reason the server is down is that it has not been started yet. The existing health poll already runs, so recovery can simply pick up from the chunk that failed. Stop is always there for anyone who disagrees.

Needs a distinct engine-indicator state — "waiting on a server that is down" is neither Kokoro nor browser fallback.


## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Popup setting for browser fallback, unchecked by default
- [ ] With it off, an unreachable server never produces browser speech
- [ ] With it off, the toolbar says the server is unavailable and waits
- [ ] Playback resumes automatically from the failed chunk when the server returns
- [ ] Play retries immediately rather than waiting for the next poll
- [ ] With it on, behaviour is unchanged from today
- [ ] Engine indicator distinguishes waiting from Kokoro and from browser fallback

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
