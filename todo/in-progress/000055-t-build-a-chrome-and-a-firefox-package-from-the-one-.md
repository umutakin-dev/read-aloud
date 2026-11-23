# Build a Chrome and a Firefox package from the one extension tree

**Type:** 🔧 Task
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Roadmap:** 🎯 NOW 2
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

- **Start:** 2026-11-24
- **End:** 2026-11-25
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-23 20:32 UTC
- **End:**
- **Effort:**

## Requirements

- [ ] npm run build writes dist/chrome and dist/firefox, each loadable unpacked
- [ ] The Firefox manifest has no offscreen permission, service_worker or offscreen page; Firefox loads it without a warning
- [ ] The Chrome manifest has no background.scripts or browser_specific_settings; Chrome loads it without a warning
- [ ] npm run package writes one zip per browser, named with the version, ready to upload
- [ ] Tests check both derived manifests against the source
- [ ] README and AGENTS say which folder to load and which zip to upload

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-11-23 20:32 UTC

- **Progress:** Started work

### 2026-11-23 20:32 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 2

### 2026-11-23 20:32 UTC
- **Note:** Dedup review: read 000027 (Chrome store paperwork, no code, Chrome only) and 000026 (packaging the Python server); neither covers a per-browser build, so this is new.

### 2026-11-23 20:32 UTC

- **Note:** Item created
