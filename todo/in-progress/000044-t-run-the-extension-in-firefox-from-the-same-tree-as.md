# Run the extension in Firefox from the same tree as Chrome

**Type:** 🔧 Task
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-11-16 05:31 UTC

## Description

Umut is on Firefox now, and the extension only loads in Chrome: it needs a service worker, the offscreen API and getContexts, none of which Firefox MV3 has. Firefox gets a background page with a DOM instead, so audio can play there directly. One extension/ folder serves both browsers: each ignores the other's background key. Chrome is re-verified afterwards. Spike 000025 stays parked; this does not decide the server-vs-browser route.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:** 2026-11-16 05:31 UTC
- **End:**
- **Effort:**

## Requirements

- [ ] Loads in Firefox without manifest errors
- [ ] Reads a page aloud in Firefox with word highlighting
- [ ] Playback survives a paragraph longer than 30s (event page not suspended mid-read)
- [ ] Server accepts moz-extension origins
- [ ] Chrome path untouched in code; re-verified in Chrome before close
- [ ] README covers Firefox setup
- [ ] Tests updated and passing

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-11-16 05:31 UTC

- **Progress:** Started work

### 2026-11-16 05:31 UTC

- **Note:** Item created
