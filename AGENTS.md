# AGENTS.md

Guidance for coding agents working in this repo. `README.md` is the user
manual; this file is what you need to change the code without undoing a
decision someone already made on purpose.

## What this is

A browser extension for Firefox and Chrome that reads web pages aloud with
word-level highlighting, backed by a local Python server running Kokoro TTS.

```
extension/            MV3 extension, plain JS, no build step, one tree for both browsers
  background.js       injection, TTS relay, player control
                      (Chrome: service worker; Firefox: event page)
  content.js          toolbar, extraction, highlighting, playback state
  offscreen.js/.html  audio player (Chrome: offscreen document;
                      Firefox: loaded into the background page itself)
  popup.*             settings
  lib/textkit.js      pure text logic: paragraphs, chunks, text index, spans
  lib/Readability.js  vendored Mozilla Readability, do not edit
server/               FastAPI + Kokoro, managed with uv
  src/tts_server/alignment.py   token → character spans, kept free of torch
tests/                node:test suites for the extension
spikes/               timeboxed experiments, not shipped
todo/                 work items (see Workflow)
```

## Commands

```bash
npm install                      # once, for jsdom
npm test                         # extension suite

uv run --directory server --no-project --with pytest --with httpx --with starlette pytest
                                 # server suite without installing torch

uv sync --directory server       # full server install (CUDA torch, ~2.6GB)
uv run --directory server uvicorn tts_server.main:app --port 7860
```

CI (`.github/workflows/test.yml`) runs both suites on Node 22/24 and Python
3.10/3.13. Neither suite needs a GPU or a browser.

## Decisions not to undo

Each of these was a fix. Reverting one brings the bug back.

- **Content scripts are injected on demand**, never declared in the manifest
  for `<all_urls>` (000013). `activeTab` grants access from the action click,
  the context menu and the shortcut. `tests/manifest.test.js` enforces it.
- **No wildcard host permissions** (000007). Only localhost hosts may appear,
  and the test enforces this too.
- **Audio is always synthesized at 1.0x.** Playback speed comes from
  `audio.playbackRate`. Synthesizing at a rate as well would compound the two
  speeds (000002).
- **Service-worker state lives in `chrome.storage.session`,** not in module
  variables, because Chrome evicts the worker after about 30s idle (000005).
- **The offscreen document's existence is queried** with `getContexts`, never
  remembered in a flag.
- **`alignment.py` must not import torch, numpy or soundfile.** The cheap
  server test run depends on it.
- **Browser speech fallback is opt-in, off by default** (000018).
- **One manifest serves both browsers** (000044). `background` carries both
  `service_worker` (Chrome) and `scripts` (Firefox), and each browser ignores
  the other's key. Firefox loads `offscreen.js` ahead of `background.js` in one
  page, where `runtime.sendMessage` never reaches that page's own listeners, so
  the two talk by direct call (`ReadAloudPlayer`). Never route player traffic
  back through runtime messages. `tests/firefox-background.test.js` loads both
  files together to catch it.
- **The content script pings `KEEPALIVE` every 20s while audio plays.** Firefox
  suspends an event page after about 30s without an incoming event, and one
  chunk can run about 35s.
- **Firefox 140 is the floor**, because the highlighting needs the CSS Custom
  Highlight API.

## Code conventions

- Plain JS that browsers load directly: no bundler, no modules in content
  scripts, no dependencies in `extension/`.
- Comments explain *why*, often citing the item that motivated the code.
  Keep that habit, and keep existing comments accurate when behaviour changes.
- Tests load the real source files into a `vm` sandbox with stubbed `chrome`
  APIs, so they break when a file changes. Extend that pattern rather than
  extracting functions for testing.

## Workflow

- Work items live in `todo/` and are managed only through the todo CLI
  (`~/.claude/skills/todo/todo`). Never hand-edit an item or `BOARD.md`.
- Every change starts from an item and goes on a branch named
  `feat|fix|chore/{id}-{slug}`. Nothing is committed to `main`; changes land by
  PR.
- Commit subjects use conventional prefixes (`feat:`, `fix:`, `chore:`,
  `test:`, `spike:`).
