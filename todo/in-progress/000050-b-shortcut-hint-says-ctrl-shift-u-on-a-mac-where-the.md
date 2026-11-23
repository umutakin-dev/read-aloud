# Shortcut hint says Ctrl+Shift+U on a Mac, where the shortcut is Command+Shift+U

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-23 12:26 UTC

**Parent:** 000037

## Description

The manifest suggests Ctrl+Shift+U, which Chrome and Firefox both bind as Command+Shift+U on macOS. The popup and README still say Ctrl+Shift+U, so on a Mac the hint names a shortcut that does nothing. Umut confirmed Command+Shift+U works in Firefox on the MacBook. The popup should show the shortcut the browser actually bound, which also covers a user who rebinds it.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:** 2026-11-23 12:26 UTC
- **End:**
- **Effort:**

## Requirements

- [x] The popup shows the shortcut the browser bound, read from chrome.commands
- [x] With no shortcut bound, the popup says how to set one instead of naming a dead key
- [x] README names both the Mac and the Windows/Linux shortcut
- [x] Tests cover the popup's shortcut line

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-23 12:27 UTC
- **Progress:** ☑ Checked (Requirements): Tests cover the popup's shortcut line

### 2026-11-23 12:27 UTC
- **Progress:** ☑ Checked (Requirements): README names both the Mac and the Windows/Linux shortcut

### 2026-11-23 12:27 UTC
- **Progress:** ☑ Checked (Requirements): With no shortcut bound, the popup says how to set one instead of naming a dead key

### 2026-11-23 12:27 UTC
- **Progress:** ☑ Checked (Requirements): The popup shows the shortcut the browser bound, read from chrome.commands

### 2026-11-23 12:26 UTC

- **Progress:** Started work

### 2026-11-23 12:26 UTC
- **Note:** Dedup: read 000038 (keyboard controls and screen reader support), the only close match; it covers keys inside the toolbar, not the toggle's hint text.

### 2026-11-23 12:26 UTC

- **Note:** Item created
