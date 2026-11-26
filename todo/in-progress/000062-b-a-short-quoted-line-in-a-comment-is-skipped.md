# A short quoted line in a comment is skipped

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-26 08:46 UTC

## Description

On Hacker News, a reply that quotes its parent with `> hn isn't indexed` and then gives only a link was not read at all.

Why:
- the quote line is 18 characters with no closing punctuation, so `worthReading` drops it as too short (`MIN_PARAGRAPH_CHARS` is 20)
- the link paragraph is dropped as all-link
- the saved HN fixture already had such a line (`> the order is kept`), dropped silently with no test noticing

Lifting the length floor is not the fix: on the fixtures it lets in "Share this article", "6 February 2024" and "Hidden categories:".

Fix: a line opening with `>` is a quotation by convention, never page furniture, so read it however short, as a heading is.

## Estimation

- **Start:**
- **End:**
- **Effort:** ~9m (p75 1h12)

## Actual

- **Start:** 2026-11-26 08:46 UTC
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

### 2026-11-26 08:46 UTC

- **Progress:** Started work

### 2026-11-26 08:46 UTC

- **Note:** Item created
