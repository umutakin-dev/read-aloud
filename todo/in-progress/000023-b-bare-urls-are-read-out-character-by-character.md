# Bare URLs are read out character by character

**Type:** 🐛 Bug
**Status:** 🔨 In Progress
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000001

## Description

A paragraph that is nothing but a link gets spelled out. From a Hacker News thread:

```
Synthesizing 58 chars | https://www.theguardian.com/books/2003/nov/28/fiction.film
WARNING phonemizer | words count mismatch on 200.0% of the lines (2/1)
Synthesized 9.18s of audio in 0.45s | 1 timestamp(s)
```

Nine seconds of audio for one link, and a single timestamp — so the highlight sits on the whole URL for the duration while the listener hears "aitch tee tee pee ess colon slash slash". There is nothing in it worth hearing.

Skip blocks that are *only* a URL. Links inside a sentence stay, because the surrounding sentence is worth reading and rewriting the text would break highlighting — the paragraph text has to keep matching the page text character for character for `findParagraphOffset` to locate it.

The `phonemizer` "words count mismatch" warnings in that log are espeak reporting that its token count disagrees with the input's; they are noise from URLs and punctuation-heavy lines, not a fault.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] A block that is only a URL is not read
- [ ] Links inside a sentence still read normally
- [ ] Paragraph text is not rewritten, so highlighting still locates it

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
