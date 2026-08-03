# Cancel in-flight synthesis when playback stops

**Type:** 🔧 Task
**Status:** 📋 Backlog
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000028

## Description

Stopping playback abandons the result of any synthesis already in flight, but does not stop the work. The request keeps running, the GPU keeps producing audio nobody will hear, and the response is discarded on arrival.

Prefetch makes it worse than a single wasted request: two chunks ahead are always being fetched, so pressing Stop, or Next a few times quickly, leaves several synthesis jobs running. Kokoro is not async, so those queue behind each other and delay the chunk that *is* wanted.

Two halves:

- **Client:** hold an `AbortController` per request and abort on stop, on paragraph jumps, and when the voice changes and the cache is dropped (#000022 already invalidates that audio without cancelling its production).
- **Server:** notice the disconnect. FastAPI can detect it via `Request.is_disconnected`, but Kokoro's generator runs synchronously in a worker thread, so the useful granularity is between chunks rather than mid-chunk.

Low priority while it is one local user on a fast GPU. It matters more if the server ever serves more than one reader, and it is the difference between wasting a little power and wasting a lot.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Requests carry an AbortController and are aborted on stop
- [ ] Paragraph jumps abort the prefetches they invalidate
- [ ] Changing voice aborts synthesis in the old voice
- [ ] Server stops between chunks when the client has gone
- [ ] Aborting is not logged or surfaced as an error

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Note:** Item created
