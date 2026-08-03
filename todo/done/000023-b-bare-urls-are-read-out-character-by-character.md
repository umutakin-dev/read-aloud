# Bare URLs are read out character by character

**Type:** 🐛 Bug
**Status:** ✅ Done
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

**The first attempt was too narrow.** It skipped blocks that were *only* a URL, on the reasoning that a link inside a sentence had to stay — the sentence is worth reading, and rewriting the text would stop `findParagraphOffset` locating it in the page.

But mid-sentence links are the common case, and just as bad:

```
Synthesizing 153 chars | From https://www.theguardian.com/books/2000/sep/03/biography (link po…
Synthesized 16.55s of audio
```

16.5 seconds for 153 characters. The constraint was real but the conclusion was wrong: it rules out *rewriting* the text, not **splitting around** the URL. Each fragment either side remains an exact run of the page text, so `indexOf` still finds it and highlighting is untouched.

Splitting also subsumes the bare-URL case — a paragraph that is nothing but a link yields no fragments and is dropped — so the separate check comes out.

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
- [ ] A URL inside a sentence is not read either
- [ ] Text either side of a URL is still read
- [ ] Every chunk remains an exact run of the page text, so highlighting locates it
- [ ] Stray punctuation left beside a URL is not synthesized on its own

## Checklist

- [ ] Reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix verified — bug no longer reproduces
- [ ] Regression tested

## Log

### 2026-08-03

- **Progress:** Completed

### 2026-08-03
- **Delivered:** ce94ecf (fix: skip blocks that are nothing but a URL) and 842d884 (fix: split around URLs instead of only skipping bare ones)

### 2026-08-03
- **Progress:** Verified on the Hacker News comment that exposed it: the goodreads link mid-sentence is skipped, the text either side still reads, and the highlight still tracks — so splitting around the URL preserved the exact-substring property findParagraphOffset depends on.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
