# Build a Chrome and a Firefox package from the one extension tree

**Type:** 🔧 Task
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-11-23 20:32 UTC

**Parent:** 000024

## Description

Both stores take an uploaded zip, and each browser warns about the manifest keys meant for the other one. Firefox does not know the `offscreen` permission. Chrome does not know `browser_specific_settings` or `background.scripts`. A store reviewer reads those warnings too.

**The plan:**
- `extension/manifest.json` stays the one source, and `extension/` still loads unpacked in both browsers for development.
- `npm run build` also writes `dist/chrome/` and `dist/firefox/`: a copy of the tree with only that browser's keys in the manifest.
- `npm run package` zips each one for upload.

Supersedes the 000044 note that one manifest "stays" because it cannot list permissions per browser: Umut plans to publish to both stores (2026-11-23).

## Estimation

- **Start:** 2026-11-23
- **End:** 2026-11-24
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-23 20:32 UTC
- **End:** 2026-11-23 20:53 UTC
- **Effort:** 8m

## Requirements

- [x] npm run build writes dist/chrome and dist/firefox, each loadable unpacked
- [x] The Firefox manifest has no offscreen permission, service_worker or offscreen page; Firefox loads it without a warning
- [x] The Chrome manifest has no background.scripts or browser_specific_settings; Chrome loads it without a warning
- [x] npm run package writes one zip per browser, named with the version, ready to upload
- [x] Tests check both derived manifests against the source
- [x] README and AGENTS say which folder to load and which zip to upload

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-11-23 20:53 UTC
- **Note:** Took 8m against an estimate of 5h (0.0x) — measured since the previous item closed.

### 2026-11-23 20:53 UTC

- **Progress:** Completed

### 2026-11-23 20:53 UTC
- **Delivered:** PR #15: npm run build writes dist/chrome and dist/firefox, npm run package zips them. Umut loaded both on a Mac, 2026-11-23: Firefox with no offscreen warning, Chrome with no errors. The extension/ load had shown Chrome's "'background.scripts' requires manifest version of 2 or lower" error all along; the Chrome copy drops that key.

### 2026-11-23 20:53 UTC
- **Progress:** ☑ Checked (Requirements): The Chrome manifest has no background.scripts or browser_specific_settings; Chrome loads it without a warning

### 2026-11-23 20:53 UTC
- **Progress:** ☑ Checked (Requirements): The Firefox manifest has no offscreen permission, service_worker or offscreen page; Firefox loads it without a warning

### 2026-11-23 20:46 UTC
- **Decision:** Roadmap: 🎯 NOW 2 → 🎯 NOW 1

### 2026-11-23 20:34 UTC
- **Progress:** dist/ built and zipped (7.6MB each); manifests differ only in the browser keys; 203 extension tests pass. web-ext lint was denied in the session, so the no-warning checks wait on loading dist/firefox and dist/chrome in the browsers.

### 2026-11-23 20:34 UTC
- **Progress:** ☐ Unchecked (Requirements): The Chrome manifest has no background.scripts or browser_specific_settings; Chrome loads it without a warning

### 2026-11-23 20:34 UTC
- **Progress:** ☐ Unchecked (Requirements): The Firefox manifest has no offscreen permission, service_worker or offscreen page; Firefox loads it without a warning

### 2026-11-23 20:34 UTC
- **Progress:** ☑ Checked (Requirements): README and AGENTS say which folder to load and which zip to upload

### 2026-11-23 20:34 UTC
- **Progress:** ☑ Checked (Requirements): Tests check both derived manifests against the source

### 2026-11-23 20:34 UTC
- **Progress:** ☑ Checked (Requirements): npm run package writes one zip per browser, named with the version, ready to upload

### 2026-11-23 20:34 UTC
- **Progress:** ☑ Checked (Requirements): The Chrome manifest has no background.scripts or browser_specific_settings; Chrome loads it without a warning

### 2026-11-23 20:34 UTC
- **Progress:** ☑ Checked (Requirements): The Firefox manifest has no offscreen permission, service_worker or offscreen page; Firefox loads it without a warning

### 2026-11-23 20:34 UTC
- **Progress:** ☑ Checked (Requirements): npm run build writes dist/chrome and dist/firefox, each loadable unpacked

### 2026-11-23 20:32 UTC

- **Progress:** Started work

### 2026-11-23 20:32 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 2

### 2026-11-23 20:32 UTC
- **Note:** Dedup review: read 000027 (Chrome store paperwork, no code, Chrome only) and 000026 (packaging the Python server); neither covers a per-browser build, so this is new.

### 2026-11-23 20:32 UTC

- **Note:** Item created
