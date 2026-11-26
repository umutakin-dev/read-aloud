# Money and counts with M or B are read as letters

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-26 09:04 UTC

## Description

Kokoro reads "$3.8B" as "three point eight B" and "825M" as "825 M". It should hear "3.8 billion dollars" and "825 million".

Fix, through the spoken form from 000063:
- M and B after a number read as million and billion: "825M", "32.5M units"
- with a currency sign ($, €, £), the unit moves to the end: "$3.8B" is "3.8 billion dollars"; K and T count only with a sign, since "4K" alone is usually a screen resolution
- "~" before a number reads "about": "~$2.5B" is "about 2.5 billion dollars"

Depends on 000063 (the spoken form, which lets the engine hear text that differs from the page), so its branch is stacked on 000063's.

## Items

## Estimation

- **Start:**
- **End:**
- **Effort:** ~9m (p75 1h12)

## Actual

- **Start:** 2026-11-26 09:05 UTC
- **End:**
- **Effort:**

## Requirements

- [ ]

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-26 09:06 UTC
- **Progress:** PR #27 opened, stacked on #26 (000063): amounts with M/B/bn (K/T with a currency sign) sent as words, ~ before a number as about

### 2026-11-26 09:05 UTC

- **Progress:** Started work

### 2026-11-26 09:04 UTC

- **Note:** Item created
