# Data sizes like 5MB are spelled out letter by letter

**Type:** ✨ Feature
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-26 09:26 UTC

## Description

Both engines spell a data size letter by letter: "a 5MB file" is heard as "a 5 M-B file", and "100Mbps" as "100 M-B-P-S". They already say "3GHz" well.

Fix, through the spoken form (000063):
- KB, MB, GB, TB and PB after a number, attached or after one space, read as kilobytes … petabytes; KiB, MiB and the rest as kibibytes …
- singular after "a" or "an", where the size describes something ("a 5 megabyte file"), and for 1; plural otherwise ("16 gigabytes of RAM")
- a following "/s" reads "per second"; kbps, Mbps and Gbps read as kilobits, megabits and gigabits per second

## Items

## Estimation

- **Start:**
- **End:**
- **Effort:** ~13m (p75 1h35)

## Actual

- **Start:** 2026-11-26 09:24 UTC
- **End:** 2026-11-26 09:30 UTC
- **Effort:** 6m

## Requirements

- [ ]

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-26 09:30 UTC
- **Note:** Took 6m against an estimate of 13m (0.5x) — measured since the previous item closed.

### 2026-11-26 09:30 UTC

- **Progress:** Completed

### 2026-11-26 09:30 UTC
- **Delivered:** PR #30: data sizes and rates after a number sent as words; singular after a/an, plural otherwise; bps and /s read per second

### 2026-11-26 09:27 UTC
- **Progress:** PR #30 opened: data sizes and rates after a number sent as words (megabyte/megabytes, megabits per second)

### 2026-11-26 09:26 UTC

- **Progress:** Started work

### 2026-11-26 09:26 UTC

- **Note:** Item created
