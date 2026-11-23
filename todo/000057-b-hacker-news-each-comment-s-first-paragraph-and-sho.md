# Hacker News: each comment's first paragraph and short comments are not read

**Type:** 🐛 Bug
**Status:** 📋 Backlog
**Priority:** 🔴 HIGH
**Roadmap:** 🎯 NOW 2
**Tracked In:** local
**Created:** 2026-11-23 21:24 UTC

**Parent:** 000028

## Description

On item 50603845, antihero's two-line comment was skipped (Umut, 2026-11-24). Measured on a saved copy of the thread: two separate causes.

- **The first paragraph of every comment is never read.** Hacker News writes it as bare text inside `div.commtext`, and only the later paragraphs get a `<p>`. `paragraphsFromRoot` reads block elements, and a div holding `<p>`s is treated as a wrapper, so that first line falls through. nl's "> The bitter lesson has so far never failed us" is lost this way.
- **Readability drops short comments whole.** Its conditional cleaning removes a block that is short and mostly links, and a comment's header is all links (user, age, root, parent, next). antihero's comment is not in Readability's output at all.

The first is ours to fix in textkit: text sitting directly inside a wrapper, before or between its blocks, is a paragraph too. The second needs a choice: skip Readability on discussion pages, or fall back to the page's own blocks when Readability keeps much less of the text than the page shows.

## Estimation

- **Start:** 2026-11-24
- **End:** 2026-11-25
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Text directly inside a wrapper, before or between its blocks, is read as a paragraph
- [ ] Short comments Readability drops are read, on Hacker News at least
- [ ] Highlighting finds both kinds in the page
- [ ] Tests cover both, using Hacker News's comment markup

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-11-23 21:24 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 3

### 2026-11-23 21:24 UTC
- **Note:** Correction to the note above: measured by text, Readability drops 67 of the thread's 291 comments whole, 63 of them under 150 characters. The 'about a third' counted comments starting with '>' as missing because the HTML has &gt;. Separately, every comment's bare first paragraph is lost to our wrapper rule.

### 2026-11-23 21:24 UTC
- **Note:** Dedup: read 000034 (stale text index; mentions collapsing an HN thread) and 000033. Neither covers extraction. Measured: Readability's output misses about a third of the thread's comments' opening lines; part is our wrapper rule, part Readability.

### 2026-11-23 21:24 UTC

- **Note:** Item created
