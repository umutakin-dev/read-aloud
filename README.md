# Read Aloud

Chrome extension that reads web pages aloud using a local Kokoro TTS server with word-level highlighting.

## Features

- High-quality text-to-speech via local Kokoro TTS (GPU-accelerated)
- Word and sentence-level highlighting using CSS Custom Highlight API
- Automatic text extraction via Mozilla Readability.js
- Toolbar with play/pause, prev/next paragraph, speed control
- Optional Web Speech API fallback when the server is unavailable (off by default)
- Auto-reconnect when server comes back online
- Right-click context menu and keyboard shortcut (Ctrl+Shift+U)

## Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) package manager
- NVIDIA GPU with CUDA support (recommended) — falls back to CPU automatically
- [espeak-ng](https://github.com/espeak-ng/espeak-ng/releases) installed on system PATH
- Chrome or Chromium-based browser

### Installing espeak-ng (Windows)

Download the MSI installer from [espeak-ng releases](https://github.com/espeak-ng/espeak-ng/releases) and ensure it's on your PATH.

## Setup

### TTS Server

```bash
cd server
uv sync
uv run uvicorn tts_server.main:app --port 7860
```

The server will download the Kokoro model on first run (~350MB).

#### GPU and CPU

`uv sync` installs a CUDA build of torch on Windows and Linux (~2.6GB, pulled
from PyTorch's own index — PyPI only carries the CPU-only wheel). macOS keeps
resolving from PyPI.

The same wheel covers both cases: with no usable GPU it simply reports
`cuda.is_available() == False` and the engine runs on CPU. The device is chosen
at startup and logged, distinguishing the two reasons you can end up on CPU:

```
Using device: cuda (NVIDIA GeForce RTX 4070 Ti SUPER)
Using device: cpu — torch has CUDA 12.8 support but found no usable GPU.
Using device: cpu — this torch is a CPU-only build (2.10.0+cpu), so any GPU
                    on this machine is invisible to it.
```

That last line means the wrong wheel is installed, not that the machine lacks a
GPU. Re-run `uv sync` in `server/`.

For a deliberately CPU-only install:

```bash
uv sync --index pytorch-cpu=https://download.pytorch.org/whl/cpu
```

#### Logging

`READ_ALOUD_LOG_LEVEL` controls verbosity (default `INFO`):

```bash
READ_ALOUD_LOG_LEVEL=DEBUG uv run uvicorn tts_server.main:app --port 7860
```

`INFO` logs one line per synthesis with device, timing and realtime factor, one
per response, and a warning when fewer than 90% of Kokoro's tokens could be
located in the request text — that rate is the best predictor of word
highlighting drifting, since every unaligned token is a word the extension has
to estimate a position for.

`DEBUG` adds per-chunk timing and the full list of unaligned tokens.

Model-download HTTP traffic is suppressed at every level, since it dumps full
headers per file and buries the output you turned `DEBUG` on to read. Set
`READ_ALOUD_LOG_HTTP=1` on the rare occasion the wire traffic is the problem.

#### Allowed origins

The server only accepts cross-origin requests from Chrome extension origins, so
an arbitrary website you happen to be browsing cannot drive your GPU. The
extension's own requests are unaffected — a host it holds a permission for is
not a cross-origin request at all.

To point another client at it:

| Variable | Default | Purpose |
|----------|---------|---------|
| `READ_ALOUD_ALLOWED_ORIGINS` | *(empty)* | Comma-separated list of exact origins to allow |
| `READ_ALOUD_ALLOWED_ORIGIN_REGEX` | `^chrome-extension://[a-p]{32}$` | Origin pattern to allow |

### Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` directory
5. The extension icon should appear in the toolbar

## Usage

1. Start the TTS server
2. Navigate to any article or web page
3. Press **Ctrl+Shift+U** or right-click > "Read Aloud"
4. The toolbar appears at the top with playback controls
5. Words highlight as they are spoken

### Controls

| Control | Action |
|---------|--------|
| Ctrl+Shift+U | Toggle Read Aloud |
| Play/Pause button | Pause or resume playback |
| Prev/Next buttons | Jump between paragraphs |
| Speed slider | Adjust playback speed (0.5x - 3.0x) |
| Stop/Close | Stop reading and remove toolbar |

### Settings (Popup)

Click the extension icon to access:
- **Voice**: Select from available Kokoro voices
- **Speed**: Default playback speed
- **Server URL**: TTS server address (default: `http://localhost:7860`)
- **Fall back to browser speech**: Off by default

With fallback off, an unreachable server never produces browser speech. The
toolbar shows a red **Server down** indicator and waits, resuming from the
paragraph it stopped at as soon as the server answers — pressing Play retries
immediately rather than waiting for the next poll. Turn it on if you would
rather hear the browser's built-in voice than nothing.

Only the default `http://localhost:7860` is granted in the manifest. Saving a
different **localhost** port prompts for permission to reach it.

Anything other than localhost has to be allowed by hand, under **Details > Site
access** in `chrome://extensions`. That is deliberate: listing every host as an
optional permission puts Read Aloud under "Access requested" on every site you
visit, which is precisely the broad claim the on-demand injection removed.

Audio is always synthesized at 1.0x and sped up during playback, so the speed
slider applies instantly and does not invalidate already-fetched paragraphs.

## Tests

```bash
npm install          # once, for jsdom
npm test             # extension

uv sync --directory server
uv run --directory server pytest
```

The extension suite covers `extension/lib/textkit.js` — paragraph extraction,
chunking, the text index, word spans — plus the manifest, the injection flow in
`background.js`, and the preload handshake in `offscreen.js`. The server suite
covers token alignment and the CORS policy.

Neither needs a GPU and the Python tests do not import torch: everything they
touch lives in `alignment.py`, which is deliberately kept clear of it.

What they do not cover is integration — injection into a live page, offscreen
playback, service-worker eviction. That needs a real browser and is not
automated yet.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/tts` | POST | Generate WAV audio |
| `/api/tts-with-timestamps` | POST | Generate audio with word timestamps |
| `/api/voices` | GET | List available voices |

## Architecture

```
Chrome Extension (MV3)                  Local Python Server

+----------------------+              +----------------------+
| Content Script       |              | Service Worker       |
|  injected on demand  |<------------>|  - CORS relay        |
|  - Toolbar           | chrome.runtime  - Context menu      |
|  - Text extraction   |  .sendMessage|  - Keyboard shortcut |
|  - Highlighting      |              |  - Script injection  |
+----------------------+              +-----+----------+-----+
                                             |          | fetch
                     +-----------------------+          |
                     v                                  v
         +----------------------+        +----------------------+
         | Offscreen Document   |        | FastAPI (port 7860)  |
         |  - Audio playback    |        |  - Kokoro TTS (GPU)  |
         +----------------------+        |  - Word timestamps   |
                                         +----------------------+
```

### Permissions

The content script is injected when you invoke Read Aloud rather than declared
for `<all_urls>`, so the extension does not ask for access to every site you
visit and does not load 122KB into every page for a feature that is off until
you press the shortcut. Page access comes from `activeTab`, which Chrome grants
on the action click, the context menu item, and the keyboard shortcut.

A side effect worth knowing during development: because injection happens on
invocation, tabs that were already open when you reloaded the extension work
without being reloaded themselves.
