# Read Aloud

Browser extension for Firefox and Chrome that reads web pages aloud with Kokoro TTS, highlighting as it goes.

## Two engines

| | In the browser | Local server |
|---|---|---|
| Install | nothing; a ~310MB model downloads once, on first use | Python, uv, espeak-ng, CUDA torch |
| Needs | WebGPU | the server running |
| Speed | ~4x realtime after a few seconds of warm-up | 16–80x realtime |
| Highlighting | exact per sentence; words estimated within it | exact per word |

By default Read Aloud uses the server when it is running and the browser
otherwise, so it works with nothing installed and gets better when the server
is started. The popup's **Engine** setting can pin either one.

Without WebGPU, the browser engine is not offered: its CPU fallback runs at
0.5–0.8x realtime, slower than listening (measured in `spikes/browser-kokoro`).

## Features

- High-quality text-to-speech via Kokoro, in the browser on the GPU or on a local server
- Word and sentence-level highlighting using CSS Custom Highlight API
- Automatic text extraction via Mozilla Readability.js
- Toolbar with play/pause, prev/next paragraph, speed control
- Optional Web Speech API fallback when the server is unavailable (off by default)
- Auto-reconnect when server comes back online
- Right-click context menu and keyboard shortcut (Ctrl+Shift+U, or ⌘⇧U on a Mac)

## Prerequisites

For the extension:

- Node.js 22+, to build the browser engine (`npm install`, `npm run build`)
- Firefox 140+, or Chrome / a Chromium-based browser

For the optional server:

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) package manager
- An NVIDIA GPU with CUDA, or an Apple Silicon Mac (recommended) — falls back to CPU automatically
- [espeak-ng](https://github.com/espeak-ng/espeak-ng/releases) installed on system PATH

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
resolving from PyPI, whose wheel already reaches the Apple GPU through MPS.

The engine tries CUDA, then MPS, then the CPU. A CUDA wheel with no usable GPU
simply reports `cuda.is_available() == False` and the engine runs on CPU. The
device is chosen at startup and logged, along with why it ended up on CPU:

```
Using device: cuda (NVIDIA GeForce RTX 4070 Ti SUPER)
Using device: mps (Apple GPU)
Using device: cpu — torch has CUDA 12.8 support but found no usable GPU.
Using device: cpu — this torch is a CPU-only build (2.10.0+cpu), so any GPU
                    on this machine is invisible to it.
```

That last line means the wrong wheel is installed, not that the machine lacks a
GPU. Re-run `uv sync` in `server/`. On a Mac, CPU lines give Mac advice instead.

On MPS the first chunk after a fresh install compiles Metal kernels, so the
server synthesizes one word when it builds the pipeline. Metal also compiles
once for each new chunk length and caches the result on disk. A new length runs
at about CPU speed (10–13x realtime on an M-series MacBook) and a cached one at
about 20x, so MPS gets faster the more you read.

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

The server only accepts cross-origin requests from extension origins
(`chrome-extension://` and Firefox's `moz-extension://`), so
an arbitrary website you happen to be browsing cannot drive your GPU. The
extension's own requests are unaffected — a host it holds a permission for is
not a cross-origin request at all.

To point another client at it:

| Variable | Default | Purpose |
|----------|---------|---------|
| `READ_ALOUD_ALLOWED_ORIGINS` | *(empty)* | Comma-separated list of exact origins to allow |
| `READ_ALOUD_ALLOWED_ORIGIN_REGEX` | any Chrome extension ID or Firefox extension UUID | Origin pattern to allow |

### Building the extension

The browser engine is bundled, since MV3 extensions may not load code from a
CDN. Build it once, and again after pulling engine changes:

```bash
npm install
npm run build        # → extension/engine/, then dist/chrome/ and dist/firefox/
npm run package      # the same, plus dist/read-aloud-{chrome,firefox}-<version>.zip
```

`extension/manifest.json` serves both browsers, so `extension/` loads unpacked
in either while you work on it, with one harmless warning each: Firefox does
not know the `"offscreen"` permission, and Chrome lists "'background.scripts'
requires manifest version of 2 or lower" under the extension's Errors. The
build writes a copy per browser into `dist/` with only that browser's keys, and
that copy is what the store gets. Load it to test a release; it needs
`npm run build` again after every change.

The zips are what you upload to the Chrome Web Store and addons.mozilla.org.
The Firefox one bundles minified code (the engine), so Mozilla also asks for
the source: a zip of this repository and the build steps above.

Without `extension/engine/` the extension still loads and the server engine
still works; the browser engine reports that it is not built. The `dist/`
build refuses to run without it.

### Firefox Extension

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on…"
3. Select `manifest.json` in `dist/firefox/` (or in `extension/` while
   developing)
4. Open `about:addons`, choose Read Aloud > **Permissions**, and make sure
   access to `localhost:7860` is allowed

A temporary add-on is removed when Firefox closes. Release Firefox only keeps
add-ons that Mozilla has signed, so a permanent install needs either a signed
build or Firefox Developer Edition / Nightly with
`xpinstall.signatures.required` set to `false`.

In Firefox the shortcut can be changed under `about:addons` > gear menu >
**Manage Extension Shortcuts**.

### Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/chrome/` directory (or `extension/` while developing)
5. The extension icon should appear in the toolbar

## Usage

1. Optionally, start the TTS server
2. Navigate to any article or web page
3. Press **Ctrl+Shift+U** (**⌘⇧U** on a Mac) or right-click > "Read Aloud"
4. The toolbar appears at the top with playback controls
5. Words highlight as they are spoken

The first read on the browser engine downloads the model (~310MB) and says so
in the toolbar. Every later load comes from the browser's cache, followed by a
few seconds of GPU warm-up.

### Controls

| Control | Action |
|---------|--------|
| Ctrl+Shift+U (⌘⇧U on a Mac) | Toggle Read Aloud; the popup shows the shortcut actually bound |
| Play/Pause button | Pause or resume playback |
| Prev/Next buttons | Jump between paragraphs |
| Speed slider | Adjust playback speed (0.5x - 3.0x) |
| Stop/Close | Stop reading and remove toolbar |

### Settings (Popup)

Click the extension icon to access:
- **Engine**: Automatic (default), this browser, or the local server only
- **Voice**: Select from available Kokoro voices
- **Speed**: Default playback speed
- **Server URL**: TTS server address (default: `http://localhost:7860`)
- **Read citation markers**: Off by default, so Wikipedia-style `[7]` and
  `[citation needed]`, and footnote links like `¹`, are skipped
- **Fall back to browser speech**: Off by default

"Browser speech" here is the browser's built-in voice (the Web Speech API), not
the browser Kokoro engine. With fallback off, an unreachable engine never
produces browser speech. The toolbar shows a red **Server down** indicator
(or **No engine**, when the browser cannot run Kokoro either) and waits, resuming from the
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
covers token alignment, the CORS policy and the choice of compute device.

Neither needs a GPU and the Python tests do not import torch: everything they
touch lives in `alignment.py` and `device.py`, which are deliberately kept
clear of it (`device.py` takes torch as an argument). So the
server suite also runs without installing the project at all:

```bash
uv run --directory server --no-project \
  --with pytest --with httpx --with starlette pytest
```

Both suites run on push and pull request via `.github/workflows/test.yml`,
across Node 22 and 24 and Python 3.10 and 3.13.

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

One `extension/` folder serves both browsers. They differ only in where the
background code and the audio player run:

| | Chrome | Firefox |
|---|---|---|
| Background | service worker (`background.service_worker`) | event page (`background.scripts`) |
| Audio player | offscreen document (`offscreen.html`) | the background page itself, since Firefox has no offscreen API |

Each browser ignores the other's manifest key. In Firefox `offscreen.js` is
loaded into the background page ahead of `background.js`, which then calls the
player directly: in that page `runtime.sendMessage` would never reach the
page's own listeners. The diagram shows Chrome.

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
