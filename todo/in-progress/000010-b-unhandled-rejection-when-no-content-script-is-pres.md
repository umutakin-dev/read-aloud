# Unhandled rejection when no content script is present

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`chrome.tabs.sendMessage` is called without a `.catch()` in both the context-menu handler (`background.js:14`) and the command handler (`background.js:24`).

On any page with no content script — `chrome://` pages, the PDF viewer, the Web Store, or a tab that was already open when the extension was installed — the returned promise rejects with "Could not establish connection" and surfaces as an unhandled rejection in the service worker console.

The relay at `background.js:58` already does this correctly with `.catch(() => {})`; these two just need the same treatment. Better still, tell the user why nothing happened instead of failing silently.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Both `tabs.sendMessage` call sites handle rejection
- [ ] No unhandled rejection when triggered on a `chrome://` page or the PDF viewer
- [ ] User gets some signal that the page is not readable

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03
- **Progress:** Shipped in 86dd492.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
