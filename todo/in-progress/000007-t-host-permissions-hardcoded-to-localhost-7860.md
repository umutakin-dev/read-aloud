# host_permissions hardcoded to localhost:7860

**Type:** 🔧 Task
**Status:** 🔨 In Progress
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`manifest.json:13-15` grants `http://localhost:7860/*` and nothing else, while the popup invites the user to type any Server URL they like (`popup.html:33`).

It currently still works, but only by accident: the server sends permissive CORS headers (`main.py:16-22`), so the service worker's cross-origin fetch succeeds as an ordinary CORS request. Any user who changes the port is relying on that, and it breaks the moment #000012 tightens CORS.

**Fix:** request the host permission for the configured URL at runtime via `chrome.permissions.request()` when the user saves a non-default server URL, and surface a clear error in the popup if it is denied. Keep the localhost default in the manifest so the common path needs no prompt.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Default localhost URL works with no permission prompt
- [ ] Saving a custom server URL requests the matching host permission at runtime
- [ ] Denied permission produces a clear message in the popup
- [ ] `optional_host_permissions` declared in the manifest

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03
- **Decision:** Narrowed optional_host_permissions from http://*/* and https://*/* to localhost and 127.0.0.1 only. The wildcard put Read Aloud under Chrome's 'Access requested' grouping on every site — reintroducing the broad claim that on-demand injection had just removed. Non-localhost servers now need granting by hand under Details > Site access, which Umut chose as the right trade.

### 2026-08-03
- **Progress:** Shipped in 7ed98e8.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
