# Remove stale player.html web accessible resource

**Type:** 🔧 Task
**Status:** ✅ Done
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

`manifest.json:48-53` declares `player.html` as a web-accessible resource exposed to `<all_urls>`. That file does not exist — it is a leftover from the pre-offscreen-document approach replaced in 00b4269.

Dead config, and it needlessly widens the extension's declared surface.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] `web_accessible_resources` block removed from the manifest
- [ ] Extension loads without warnings in `chrome://extensions`

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** 86dd492 (fix: drop dead manifest entry, handle unscriptable tabs, keep saved voice)

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
