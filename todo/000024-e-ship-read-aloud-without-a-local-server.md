# Ship Read Aloud without a local server

**Type:** 👑 Epic
**Status:** 📋 Backlog
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

## Description

The target is general users, not developers. Today, using Read Aloud means: install Python, install uv, install espeak-ng onto your PATH, run a uvicorn process, and keep a terminal open for as long as you want to listen. On the Chrome Web Store that is not friction, it is an extinction event — almost nobody will complete it, and the ones who fail will leave one-star reviews about an extension that "doesn't work".

Every other improvement is downstream of solving this. It is also the one that could *delete* work rather than add it: if Kokoro can run in the browser, the FastAPI server, the CORS policy, the host permissions, the health polling, the reconnect handling and the service-worker relay all stop existing.

So the sequence is: find out whether the browser can do it (#000025), and only if it cannot, make installing the server somebody else's problem (#000026). Store paperwork (#000027) is needed either way and can proceed in parallel.


- #000025 🔧 Spike Kokoro in the browser and whether timestamps survive
- #000026 🔧 Package the server so it installs and runs itself
- #000027 🔧 Chrome Web Store listing, privacy policy and permission justification
## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ]

## Checklist

- [ ] All child features identified and created
- [ ] Requirements reviewed
- [ ] All child features completed
- [ ] Integration tested end-to-end
- [ ] Documentation updated

## Log

### 2026-08-03
- **Note:** Added #000027 Chrome Web Store listing, privacy policy and permission justification to Items

### 2026-08-03
- **Note:** Added #000026 Package the server so it installs and runs itself to Items

### 2026-08-03
- **Note:** Added #000025 Spike Kokoro in the browser and whether timestamps survive to Items

### 2026-08-03

- **Note:** Item created
