# Read Aloud

Chrome extension that reads web pages aloud using a local Kokoro TTS server with word-level highlighting.

## Features

- High-quality text-to-speech via local Kokoro TTS (GPU-accelerated)
- Word and sentence-level highlighting using CSS Custom Highlight API
- Automatic text extraction via Mozilla Readability.js
- Toolbar with play/pause, prev/next paragraph, speed control
- Web Speech API fallback when server is unavailable
- Auto-reconnect when server comes back online
- Right-click context menu and keyboard shortcut (Ctrl+Shift+U)

## Prerequisites

- Python 3.10-3.12
- [uv](https://docs.astral.sh/uv/) package manager
- NVIDIA GPU with CUDA support (recommended) or CPU
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

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/tts` | POST | Generate WAV audio |
| `/api/tts-with-timestamps` | POST | Generate audio with word timestamps |
| `/api/voices` | GET | List available voices |

## Architecture

```
Chrome Extension (MV3)                    Local Python Server
+----------------+   chrome.runtime    +---------------------+
| Content Script |<------------------->| Service Worker (SW)  |
|  - Toolbar     |   .sendMessage      |  - CORS relay        |
|  - Highlighting|                     |  - Context menu      |
|  - Audio play  |                     |  - Keyboard shortcut |
+----------------+                     +----------+-----------+
                                                  | fetch
                                                  v
                                       +---------------------+
                                       | FastAPI (port 7860)  |
                                       |  - Kokoro TTS (GPU)  |
                                       |  - Word timestamps   |
                                       +---------------------+
```
