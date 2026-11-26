# Roman numerals are read as letters

**Type:** ✨ Feature
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-26 08:53 UTC

## Description

Kokoro spells a Roman numeral out letter by letter: "GTA VI" is heard as "GTA vee eye", not "GTA six".

Fix in two parts:
- a spoken form: the text sent to the engine may differ from the page text, with every word's offsets mapped back, so highlighting still lands on "VI" while "six" is heard
- a cautious numeral rule over I, V and X only

The rule:
- two or more letters (II, IV, VI, XII…) right after a capitalised word: "GTA VI", "World War II"
- a single V or X only after an all-caps name: "GTA V", but never "Malcolm X"
- a lone "I" is never a numeral
- always the plain number ("Henry VIII" is "Henry eight"); ordinals for rulers are left for later

## Items

## Estimation

- **Start:**
- **End:**
- **Effort:** ~9m (p75 1h12)

## Actual

- **Start:** 2026-11-26 07:26 UTC
- **End:** 2026-11-26 09:09 UTC
- **Effort:** 1h43

## Requirements

- [ ]

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-26 09:09 UTC
- **Note:** Took 1h43 against an estimate of 9m (11.4x) — measured since the previous item closed.

### 2026-11-26 09:09 UTC

- **Progress:** Completed

### 2026-11-26 09:09 UTC
- **Delivered:** PR #26: the engine is sent a spoken form (GTA six) and word spans are mapped back to the page; I/V/X numerals by a cautious rule

### 2026-11-26 08:56 UTC
- **Progress:** PR #26 opened: spoken form sent to the engine, word spans mapped back to the page; cautious I/V/X rule

### 2026-11-26 08:53 UTC

- **Progress:** Started work

### 2026-11-26 08:53 UTC

- **Note:** Item created
