# Orphaned content script keeps running after extension reload

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

Reloading the extension invalidates a content script's `chrome.*` bridge but does not stop the script. Its timers keep firing, its Web Speech utterance keeps speaking, and every message it tries to send throws `Extension context invalidated`:

```
content.js:342 Uncaught (in promise) Error: Extension context invalidated.   (x20)
content.js:555 Read Aloud: Web Speech error SpeechSynthesisErrorEvent
```

Two things keep an orphan alive. The health-check interval fires forever, and each tick calls `chrome.runtime.sendMessage` — which throws synchronously in an invalidated context, inside a promise executor, with no catch, so it surfaces as an unhandled rejection every interval for as long as the tab is open. And a fallback utterance chained through `onend` keeps speaking, which is audible, not merely noisy.

The teardown handshake added for on-demand injection only helps when a *new* copy is injected — it needs someone to trigger Read Aloud again. An orphan nobody re-triggers just runs.

`chrome.runtime.id` becomes undefined when the context dies, so an orphan can detect its own state. It should stop its timers, cancel speech, drop its toolbar and go quiet rather than waiting to be replaced. Every message send should also degrade quietly instead of throwing.

Worth noting the reported line numbers predate the chunk refactor, but both mechanisms are still present.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Message sends degrade quietly when the extension context is gone
- [ ] An orphaned copy stops its own timers rather than firing forever
- [ ] An orphaned copy cancels speech and removes its toolbar
- [ ] Reloading the extension mid-read leaves no console spam and no audio
- [ ] `chrome.runtime.lastError` is read on every callback so Chrome stops logging it

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
