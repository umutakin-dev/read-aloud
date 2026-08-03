# Paragraph detection collapses on pages without text newlines

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

Paragraphs are recovered by splitting Readability's flattened `article.textContent` on blank lines, falling back to single newlines when that yields one piece. That only works when the extracted text happens to carry newlines where paragraphs ended — a property of the source markup, not of the document structure.

On a Hacker News thread it fails completely: the toolbar reads `Paragraph 1/2` for an entire comment page, so Next skips half the page in one press. That is worse than the chunk-stepping it replaced in #000016, which at least moved in usable increments.

The information is right there in the DOM and gets thrown away by flattening to text first. Extract paragraphs from block-level elements instead — `p`, `li`, `blockquote`, headings, `pre` — reading `article.content` (HTML) rather than `article.textContent`, and walking the live document when Readability declines to parse.

Skip any block that contains another block, or a `<li>` wrapping a `<p>` would emit its text twice.

Highlighting is unaffected: a block's normalized `textContent` is still a contiguous run of the collapsed page text, which is all `findParagraphOffset` needs.

Related: the first paragraph takes a visibly long time to start with nothing said about why. The toolbar jumps straight to `Paragraph 1/N` while the request is still in flight, so a cold server — model load plus synthesis — looks like a hang.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Paragraphs come from block elements, not from newlines in flattened text
- [ ] A Hacker News thread yields one paragraph per comment block
- [ ] Nested blocks do not emit their text twice
- [ ] Works when Readability declines to parse, by walking the live document
- [ ] Highlighting still locates each paragraph in the page
- [ ] Toolbar says it is synthesizing while a request is in flight

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
