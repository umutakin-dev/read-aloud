# Popup overwrites saved voice when server is down

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`popup.js` only restores the saved voice inside the server-healthy branch (`popup.js:57-59`), after the voice list has been fetched and the `<select>` repopulated.

When the server is down, that branch never runs, so the `<select>` keeps the single hardcoded `af_heart` option from `popup.html:19`. Clicking Save then writes `voice: "af_heart"` (`popup.js:71`), silently discarding whatever voice the user had chosen — and they get no indication it happened.

**Fix:** keep the saved voice as an option in the list even when it cannot be validated against the server, and do not write a voice value the user did not pick.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Saved voice is shown in the popup even when the server is unreachable
- [ ] Saving with the server down preserves the previously chosen voice
- [ ] Voice list repopulates correctly once the server comes back

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
- **Delivered:** 86dd492 (fix: drop dead manifest entry, handle unscriptable tabs, keep saved voice)

### 2026-08-03
- **Progress:** Verified in Chrome — popup opened with the server stopped still shows the saved voice af_alloy rather than resetting to the hardcoded af_heart default.

### 2026-08-03
- **Progress:** Shipped in 86dd492.

### 2026-08-03
- **Note:** Implemented and syntax/logic checked, but the remaining checklist items need the extension loaded in Chrome. Left in progress until verified in the browser.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
