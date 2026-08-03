# Text index goes stale on single-page-app navigation

**Type:** 🐛 Bug
**Status:** 📋 Backlog
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000028

## Description

The text index is built once per session and cached, holding direct references to text nodes. That was a deliberate improvement — it used to be rebuilt for every chunk — but it assumes the page stops changing, which is false on a large share of the modern web.

Three ways it goes wrong:

- **Client-side navigation.** A single-page app changes the article under the extension without a page load, so the content script survives with an index describing an article that is no longer displayed. Chunks stop matching and highlighting quietly stops.
- **Lazy content.** Images loading, comments expanding, ads settling — all shift the DOM mid-read. `findParagraphOffset` rebuilds on a miss, but only when the *text* fails to match; node references can go stale while the text is unchanged.
- **The reader's own clicks.** Collapsing a Hacker News thread while it is being read mutates the DOM under the index.

**Approach:** watch for both. A `MutationObserver` on the reading container, debounced, to invalidate the index when the document changes materially; and a URL watch — `navigation` API where available, History API patching otherwise — to detect client-side navigation and stop the session rather than read a page that is gone.

Invalidating is cheap because the index rebuilds lazily on next use. The judgement is in deciding what counts as material, so an ad refresh does not restart a reading.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Index invalidated when the document changes materially
- [ ] Client-side navigation stops the session rather than reading stale text
- [ ] Trivial mutations do not interrupt reading
- [ ] Expanding or collapsing content mid-read does not break highlighting
- [ ] Observer disconnected on stop and on teardown

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03

- **Note:** Item created
