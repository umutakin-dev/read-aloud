# Cache synthesized audio so a re-read is instant

**Type:** 🔧 Task
**Status:** 📋 Backlog
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000037

## Description

Nothing is cached anywhere. The same paragraph in the same voice at the same speed is synthesized from scratch every time — re-reading an article, going back a paragraph, or reopening a page you listened to yesterday all pay full price.

The client cache is deliberately transient: `prefetchCache` holds two chunks ahead and deletes each on use. So going *back* one paragraph is as expensive as reading a new one.

The obvious cache key is a hash of text, voice and speed — with speed effectively out of it, since #000002 pinned synthesis to 1.0 and moved rate to playback. So the key is really text plus voice, which caches well.

Where it lives depends on #000025. If synthesis moves into the browser, an on-disk server cache is the wrong shape entirely and this becomes a client-side store instead. Worth waiting for that answer before building it.

Two things it would fix beyond speed: scrubbing backwards in #000040 becomes instant rather than a stall, and re-reading costs no GPU time at all.

Bounded by size with least-recently-used eviction, and invalidated if the model or its version changes.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Synthesized audio cached, keyed by text and voice
- [ ] Cache survives a server restart
- [ ] Bounded in size, evicting least recently used
- [ ] Invalidated when the model changes
- [ ] Re-reading a page performs no synthesis
- [ ] Placement decided after #000025

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Note:** Item created
