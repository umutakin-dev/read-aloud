# Firefox on a Mac ignores the Command-Shift-U shortcut

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-11-26 07:07 UTC

## Description

In Firefox on a Mac, the shortcut is bound to ⇧⌘U (manifest Ctrl+Shift+U, which means Command there) and Firefox lists it, but pressing it does nothing. Something on Umut's machine takes ⇧⌘U before Firefox gets it. Rebinding to ⌃⇧U in Manage Extension Shortcuts works, and Chrome's ⇧⌘U works. So the Firefox package should ship ⌃⇧U (MacCtrl+Shift+U) as its Mac default, and leave Chrome's alone.

## Estimation

- **Start:**
- **End:**
- **Effort:** ~9m (p75 1h12)

## Actual

- **Start:** 2026-11-26 07:06 UTC
- **End:** 2026-11-26 07:12 UTC
- **Effort:** 6m

## Requirements

- [x] The Firefox package's Mac default is ⌃⇧U; Chrome's and other platforms' are unchanged
- [x] A test checks both derived manifests
- [x] The popup shows ⌃⇧U in Firefox on a Mac
- [x] Umut confirms ⌃⇧U toggles reading in Firefox from a fresh install of dist/firefox

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-26 07:12 UTC

- **Progress:** Completed

### 2026-11-26 07:12 UTC
- **Progress:** Umut confirmed (2026-11-26): ⌃⇧U toggles reading in Firefox from a fresh install of dist/firefox.

### 2026-11-26 07:12 UTC
- **Progress:** ☑ Checked (Requirements): Umut confirms ⌃⇧U toggles reading in Firefox from a fresh install of dist/firefox

### 2026-11-26 07:08 UTC
- **Progress:** firefoxManifest sets suggested_key.mac to MacCtrl+Shift+U; Chrome's manifest has no mac key and keeps ⇧⌘U. Two package tests; the popup already renders MacCtrl as ⌃ (existing popup test). README's three mentions updated. dist/ rebuilt. Waiting on Umut: remove and reinstall dist/firefox (a reload keeps a binding already set), then ⌃⇧U toggles reading.

### 2026-11-26 07:08 UTC
- **Progress:** ☑ Checked (Requirements): The popup shows ⌃⇧U in Firefox on a Mac

### 2026-11-26 07:08 UTC
- **Progress:** ☑ Checked (Requirements): A test checks both derived manifests

### 2026-11-26 07:08 UTC
- **Progress:** ☑ Checked (Requirements): The Firefox package's Mac default is ⌃⇧U; Chrome's and other platforms' are unchanged

### 2026-11-26 07:07 UTC

- **Progress:** Started work

### 2026-11-26 07:07 UTC
- **Note:** Dedup: read the top candidates from todo similar (000028 rock-solid epic, 000034 stale index on SPA navigation, 000038 keyboard controls inside the toolbar, 000041 voice preview, 000054 mid-sentence stop). None covers the global shortcut; 000050 (the popup hint said Ctrl on a Mac) is closed and was about the hint, not the binding.

### 2026-11-26 07:07 UTC

- **Note:** Item created
