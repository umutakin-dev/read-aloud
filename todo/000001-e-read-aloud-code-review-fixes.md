# Read Aloud code review fixes

**Type:** 👑 Epic
**Status:** 📋 Backlog
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

## Description

Findings from a full read of the extension (`extension/`) and TTS server (`server/`) after the initial implementation landed on `feat/1-read-aloud-extension`.

The architecture is sound — MV3 offscreen document for audio, Shadow DOM toolbar, Readability for extraction. The defects cluster in two areas: **playback speed** (applied in two places, so it compounds) and **word highlighting** (offset math that does not survive contact with real page DOM). Those two are what make the extension feel broken in use, so they lead.

The rest are correctness and robustness cleanups: MV3 service-worker lifecycle assumptions, stale manifest config, and a permissive CORS policy on the local server.

## Items

- #000002 🐛 Playback speed is applied twice
- #000003 🐛 Word highlighting never matches page DOM text
- #000004 🐛 Word highlight offsets drift within a paragraph
- #000005 🐛 Active tab ID lost when service worker is evicted
- #000006 🐛 Server word-timestamp fallback mis-estimates timing
- #000007 🔧 host_permissions hardcoded to localhost:7860
- #000008 🔧 Remove stale player.html web accessible resource
- #000009 🐛 stopCurrentAudio orphans the pending audio promise
- #000010 🐛 Unhandled rejection when no content script is present
- #000011 🐛 Popup overwrites saved voice when server is down
- #000012 🔧 Restrict CORS origins on TTS server
- #000013 🔧 Inject content script on demand instead of on every page
- #000014 🔧 Install CUDA torch build with CPU fallback
- #000015 🔧 Add verbose diagnostic logging to TTS server
- #000016 ✨ Navigate by real paragraphs, not synthesis chunks
- #000017 🐛 Toolbar does not reflect which TTS engine is in use
- #000018 ✨ Make browser TTS fallback opt-in, off by default
- #000019 🐛 Paragraph detection collapses on pages without text newlines
- #000020 🐛 Orphaned content script keeps running after extension reload


## Progress
██████████░░░░░░░░░░ 50% (7/14)

- 🔨 #000002 Playback speed is applied twice
- ✅ #000003 Word highlighting never matches page DOM text
- ✅ #000004 Word highlight offsets drift within a paragraph
- 🔨 #000005 Active tab ID lost when service worker is evicted
- ✅ #000006 Server word-timestamp fallback mis-estimates timing
- 🔨 #000007 host_permissions hardcoded to localhost:7860
- ✅ #000008 Remove stale player.html web accessible resource
- 🔨 #000009 stopCurrentAudio orphans the pending audio promise
- 🔨 #000010 Unhandled rejection when no content script is present
- 🔨 #000011 Popup overwrites saved voice when server is down
- ✅ #000012 Restrict CORS origins on TTS server
- 🔨 #000013 Inject content script on demand instead of on every page
- ✅ #000014 Install CUDA torch build with CPU fallback
- ✅ #000015 Add verbose diagnostic logging to TTS server

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
- **Note:** Added #000020 Orphaned content script keeps running after extension reload to Items

### 2026-08-03
- **Note:** Added #000019 Paragraph detection collapses on pages without text newlines to Items

### 2026-08-03
- **Note:** Added #000018 Make browser TTS fallback opt-in, off by default to Items

### 2026-08-03
- **Note:** Added #000017 Toolbar does not reflect which TTS engine is in use to Items

### 2026-08-03
- **Note:** Added #000016 Navigate by real paragraphs, not synthesis chunks to Items

### 2026-08-03
- **Note:** Added #000015 Add verbose diagnostic logging to TTS server to Items

### 2026-08-03
- **Note:** Added #000014 Install CUDA torch build with CPU fallback to Items

### 2026-08-03
- **Note:** Added #000013 Inject content script on demand instead of on every page to Items

### 2026-08-03
- **Note:** Added #000012 Restrict CORS origins on TTS server to Items

### 2026-08-03
- **Note:** Added #000011 Popup overwrites saved voice when server is down to Items

### 2026-08-03
- **Note:** Added #000010 Unhandled rejection when no content script is present to Items

### 2026-08-03
- **Note:** Added #000009 stopCurrentAudio orphans the pending audio promise to Items

### 2026-08-03
- **Note:** Added #000008 Remove stale player.html web accessible resource to Items

### 2026-08-03
- **Note:** Added #000007 host_permissions hardcoded to localhost:7860 to Items

### 2026-08-03
- **Note:** Added #000006 Server word-timestamp fallback mis-estimates timing to Items

### 2026-08-03
- **Note:** Added #000005 Active tab ID lost when service worker is evicted to Items

### 2026-08-03
- **Note:** Added #000004 Word highlight offsets drift within a paragraph to Items

### 2026-08-03
- **Note:** Added #000003 Word highlighting never matches page DOM text to Items

### 2026-08-03
- **Note:** Added #000002 Playback speed is applied twice to Items

### 2026-08-03

- **Note:** Item created
