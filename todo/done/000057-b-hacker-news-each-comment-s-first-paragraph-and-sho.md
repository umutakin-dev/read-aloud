# Hacker News: each comment's first paragraph and short comments are not read

**Type:** 🐛 Bug
**Status:** ✅ Done
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-11-23 21:24 UTC

**Parent:** 000028

## Description

On item 50603845, antihero's two-line comment was skipped (Umut, 2026-11-24). Measured on a saved copy of the thread: two separate causes.

- **The first paragraph of every comment is never read.** Hacker News writes it as bare text inside `div.commtext`, and only the later paragraphs get a `<p>`. `paragraphsFromRoot` reads block elements, and a div holding `<p>`s is treated as a wrapper, so that first line falls through. nl's "> The bitter lesson has so far never failed us" is lost this way.
- **Readability drops short comments whole.** Its conditional cleaning removes a block that is short and mostly links, and a comment's header is all links (user, age, root, parent, next). antihero's comment is not in Readability's output at all.

The first is ours to fix in textkit: text sitting directly inside a wrapper, before or between its blocks, is a paragraph too. The second needs a choice: skip Readability on discussion pages, or fall back to the page's own blocks when Readability keeps much less of the text than the page shows.

## Estimation

- **Start:** 2026-11-27
- **End:** 2026-11-28
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:** 2026-11-26 09:49 UTC
- **End:** 2026-11-26 09:49 UTC
- **Effort:** 0m

## Requirements

- [x] Text directly inside a wrapper, before or between its blocks, is read as a paragraph
- [x] Short comments Readability drops are read, on Hacker News at least
- [x] Highlighting finds both kinds in the page
- [x] Tests cover both, using Hacker News's comment markup

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-26 09:49 UTC
- **Note:** Took 0m against an estimate of 5h (0.0x) — measured since the previous item closed.

### 2026-11-26 09:49 UTC

- **Progress:** Completed

### 2026-11-26 09:49 UTC
- **Progress:** ☑ Checked (Requirements): Tests cover both, using Hacker News's comment markup

### 2026-11-26 09:49 UTC
- **Progress:** ☑ Checked (Requirements): Highlighting finds both kinds in the page

### 2026-11-26 09:49 UTC
- **Progress:** ☑ Checked (Requirements): Short comments Readability drops are read, on Hacker News at least

### 2026-11-26 09:49 UTC
- **Progress:** ☑ Checked (Requirements): Text directly inside a wrapper, before or between its blocks, is read as a paragraph

### 2026-11-26 09:49 UTC
- **Delivered:** Fixed by 000058 (our own text extractor in place of Readability): a comment's bare first paragraph and short replies are read; tests/pages.test.js covers both on the Hacker News fixture

### 2026-11-23 21:55 UTC
- **Decision:** Roadmap: 🎯 NOW 4 → (unscheduled)

### 2026-11-23 21:55 UTC
- **Decision:** Umut, 2026-11-24: replace Readability with our own extractor rather than patching around it. Both causes are fixed by 000058, and this item closes when it lands.

### 2026-11-23 21:24 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 3

### 2026-11-23 21:24 UTC
- **Note:** Correction to the note above: measured by text, Readability drops 67 of the thread's 291 comments whole, 63 of them under 150 characters. The 'about a third' counted comments starting with '>' as missing because the HTML has &gt;. Separately, every comment's bare first paragraph is lost to our wrapper rule.

### 2026-11-23 21:24 UTC
- **Note:** Dedup: read 000034 (stale text index; mentions collapsing an HN thread) and 000033. Neither covers extraction. Measured: Readability's output misses about a third of the thread's comments' opening lines; part is our wrapper rule, part Readability.

### 2026-11-23 21:24 UTC

- **Note:** Item created
