# Inject content script on demand instead of on every page

**Type:** 🔧 Task
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

The manifest declares a content script on `<all_urls>` at `document_idle`, so 3,641 lines / 122 KB (`Readability.js` is 2,786 of them) load into every page in every tab, for a feature that is off until the user presses Ctrl+Shift+U.

Three costs:

- **Memory.** Content scripts run in an isolated world — a separate JS context per frame with its own copy of the compiled code. `content.js` builds its state, registers two `Highlight` objects and a message listener, then idles. Every open tab pays for that.
- **Install prompt.** `content_scripts.matches: ["<all_urls>"]` is what triggers Chrome's broadest warning, "Read and change all your data on all the websites you visit." Nothing else in the manifest needs it — `host_permissions` is only `localhost:7860`, and the optional ones do not appear at install.
- **CPU.** Real but minor; Chrome code-caches content scripts, so parse/compile is amortized.

It also leaves #000010 half-fixed. Chrome never injects into tabs that were already open, so any tab predating an install, update, or `chrome://extensions` reload has no content script — permanently, until reloaded. #000010 made that failure visible on the badge, but the user still has to know the remedy is to reload the page. During development this is the dominant failure mode.

**Fix:** drop the `content_scripts` block and inject from the service worker on invocation — message first (so a second press toggles off), inject and retry on failure, badge only if the page is genuinely unscriptable. Needs no new permissions: `scripting` is already declared, and `activeTab` is granted by all three entry points (action click, context menu item, commands shortcut).

The injected script must tolerate re-injection. A stale copy orphaned by an extension reload has a dead context but may still occupy the isolated world, so a plain "already loaded" flag would lock the tab out of a fresh injection — the exact case this change exists to fix.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] `content_scripts` block removed from the manifest
- [ ] Toggle injects on demand and retries, using only existing permissions
- [ ] Second invocation toggles off rather than injecting a duplicate
- [ ] A tab open since before an extension reload works without being reloaded
- [ ] Genuinely unscriptable pages still fall through to the badge
- [ ] Re-injection replaces the previous instance rather than doubling listeners

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** 42369b4 (refactor: inject the content script on demand instead of on every page) and e0812e7 (fix: clear orphaned toolbar and highlights on injection)

### 2026-08-03
- **Progress:** Verified by clean-room install: extension removed, tab reloaded without it, extension loaded fresh, then Ctrl+Shift+U on that already-open tab worked without reloading the page. That is exactly the case declarative injection could never handle.

### 2026-08-03
- **Note:** Implemented and control-flow verified, but the acceptance criteria need Chrome: activeTab grant on each entry point, and the reload-the-extension-without-reloading-the-tab case. Left in progress until verified in the browser.

### 2026-08-03
- **Progress:** Removed the content_scripts block; toggleReadAloud now messages first, injects and retries on failure, and badges only when the page is genuinely unscriptable. content.js tears down a previous copy via window.__readAloudTeardown rather than bailing on a flag, with DOM/timer cleanup ordered before anything that throws on an invalidated context. Verified all four control-flow paths against the real background.js under a mocked chrome API. Shipped in 42369b4.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
