# Toolbar does not reflect which TTS engine is in use

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

The toolbar shows `Paragraph 8/366` whether Kokoro or the browser's built-in speech is producing the audio, and whether the server is up or down. The popup knows — it shows "Server unavailable (will use browser TTS)" — but the toolbar you are actually looking at while reading does not.

Two ways the status goes stale:

- The `(Browser TTS)` suffix is only written by `playParagraphWithWebSpeech` when a paragraph starts. Kill the server mid-paragraph and the toolbar keeps claiming the previous state until the next paragraph fails over.
- `startHealthCheckTimer` flips `state.useServer` back to true on reconnect and writes a one-off "Server reconnected" message, which the next paragraph's status update immediately overwrites.

The engine in use is persistent state, so it should have a persistent indicator rather than borrowing the transient status line — the voice quality difference between Kokoro and browser TTS is obvious enough that a reader will want to know which they are hearing, and why.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Toolbar carries a persistent indicator of the engine in use
- [ ] Indicator updates when the server drops mid-read, not at the next paragraph
- [ ] Indicator updates on reconnect and is not overwritten by the status line
- [ ] Distinguishes Kokoro, browser fallback, and connecting states

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
- **Delivered:** 542b3e2 (feat: navigate by paragraph, resume after offscreen teardown, show engine)

### 2026-08-03
- **Progress:** Verified: the toolbar carries a green Kokoro indicator throughout a session instead of the engine being invisible.

### 2026-08-03

- **Note:** Item created
