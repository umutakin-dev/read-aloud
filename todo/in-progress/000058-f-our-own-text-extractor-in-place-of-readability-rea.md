# Our own text extractor in place of Readability, reading the live page

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Roadmap:** 🎯 NOW 2
**Tracked In:** local
**Created:** 2026-11-23 21:55 UTC

**Parent:** 000028

## Description

Readability rebuilds a clean copy of the article as new HTML, and its clutter rules drop short blocks under link-heavy headers: 67 of 291 comments on one Hacker News thread (000057). We need less than it does: the readable text, in reading order, from the live page. Extracting from its copy also means hunting for every sentence again in the real page, which is where highlighting misses come from.

**The plan (Umut agreed, 2026-11-24):**
- Walk the live page in order, including text sitting directly in a container.
- Drop page furniture by structure: nav, header, footer, aside, forms, buttons, ARIA navigation and banner regions, hidden elements.
- Main region: `<main>` or `<article>` when present, else the container with the most non-link text.
- Judge each block on its own link density, so a menu goes and a short comment stays.
- Saved pages as tests: each site that reads badly becomes a fixture and a fix.

Closes 000057 when it lands.

## Items

## Estimation

- **Start:** 2026-11-24
- **End:** 2026-11-25
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-23 21:56 UTC
- **End:**
- **Effort:**

## Requirements

- [ ] Extraction reads the live page; Readability is removed from the extension
- [ ] Text directly inside a container, before or between its blocks, is read
- [ ] Navigation, headers, footers, sidebars, forms and hidden text are not read
- [ ] Short blocks under link-heavy headers are read: every comment on the saved HN thread
- [ ] Saved-page tests: Hacker News, Wikipedia, a news article, a blog and a docs page
- [ ] Every extracted block is found in the page, so highlighting has nothing to hunt for
- [ ] Citation markers are still skipped unless the setting says to read them
- [ ] Read in Chrome and Firefox on real pages before merging

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-23 21:56 UTC

- **Progress:** Started work

### 2026-11-23 21:55 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 2

### 2026-11-23 21:55 UTC
- **Note:** Dedup: read 000057 (the HN bug this fixes; it closes with this item) and 000034 (stale text index on page changes). 000034 stays separate: it is about keeping the index current, not extraction, though reading the live page should make it simpler.

### 2026-11-23 21:55 UTC

- **Note:** Item created
