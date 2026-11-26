# IV is read as roman four on the browser engine

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-26 09:19 UTC

## Description

On the browser engine, "The nurse started an IV drip." is heard as "an roman four drip".

Cause: kokoro-js voices words through espeak-ng, which reads any run of Roman-numeral letters it can place as "roman" and a number ("XX" is "roman twenty"). The server engine (misaki) reads "IV" as "eye vee". The 000063 rule turns real numerals into words before either engine sees them, but leaves the lookalikes as written, and those reach espeak's rule.

Fix: a run of two or more of I, V and X that the 000063 rule keeps as letters is sent hyphenated ("I-V"), which both engines voice letter by letter.

## Estimation

- **Start:**
- **End:**
- **Effort:** ~14m (p75 1h35)

## Actual

- **Start:** 2026-11-26 09:19 UTC
- **End:**
- **Effort:**

## Requirements

- [ ]

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-26 09:21 UTC
- **Progress:** PR #29 opened, stacked on #28 (000065): numeral lookalikes kept as letters are sent hyphenated (I-V) so espeak spells them

### 2026-11-26 09:19 UTC

- **Progress:** Started work

### 2026-11-26 09:19 UTC

- **Note:** Item created
