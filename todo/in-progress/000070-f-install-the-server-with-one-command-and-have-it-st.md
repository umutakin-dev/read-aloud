# Install the server with one command and have it start at login

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-11-26 11:30 UTC

**Parent:** 000024

## Description

Without WebGPU (mostly Linux, plus older or locked-down machines), the local server is the only way to hear Kokoro; the system voice from 000069 is a last resort nobody would choose. Today the server is a developer setup: clone, `uv sync`, `uvicorn` in a terminal kept open. A user who forgets to start it gets "waiting" and has to go and start it by hand.

Level 1 of the server choice (Umut, 2026-11-26): no native messaging and no ONNX port, which is what retired 000026 (package the server so it installs and runs itself) described. Instead:

- **One install command** that puts the server on the user's machine as a tool (`uv tool install` from the repo) and gives it a `read-aloud-server` entry point.
- **Start at login.** The same tool registers a per-user service (launchd agent on macOS, systemd user unit on Linux, a Startup entry on Windows), so the user never has to remember it. `uninstall` removes it.
- **Lazy model load.** The server answers health at once and loads Kokoro on the first synthesis, so a server that starts at every login costs little memory until it is used.
- **Faster pickup.** While the toolbar is waiting on the server it checks every 2s instead of 15s, then goes back to 15s. The 30s ceiling for Firefox's event page still holds.

No new extension permission: `http://localhost:7860/*` is already in `host_permissions`.

## Items

## Estimation

- **Start:**
- **End:**
- **Effort:** ~19m (p75 57m)

## Actual

- **Start:** 2026-11-26 11:30 UTC
- **End:**
- **Effort:**

## Requirements

- [x] One documented command installs the server as a tool with a read-aloud-server entry point
- [ ] read-aloud-server install-service registers a per-user login service on macOS, Linux and Windows; uninstall-service removes it
- [x] Health answers before the model is loaded; Kokoro loads on the first synthesis
- [x] Toolbar checks every 2s while waiting on the server, 15s otherwise
- [x] README and the toolbar's no-server message point to the install command
- [ ] Tested on at least one real machine: install, log out and in, read without starting anything

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-26 11:38 UTC
- **Note:** PR #33 opened: one-command install, start-at-login service on macOS, Linux and Windows, 2s toolbar poll while Kokoro is down.

### 2026-11-26 11:37 UTC
- **Note:** Built on feat/000070-server-install-at-login.

Verified on this Mac:
- `uv tool install ./server` honours the pyproject's sources (en-core-web-sm came from its release URL) and puts `read-aloud-server` on PATH
- run from there, health answered at once; Kokoro loaded on the first request (14s cold, then 6.4x realtime on MPS)
- health was already independent of the model, so lazy loading needed no change
- espeak-ng is not needed on PATH: it ships as the espeakng-loader wheel, so the README prerequisite was dropped

Not yet verified:
- the login service (launchd, systemd --user, HKCU Run) is tested against a temp home with system calls recorded, not installed for real anywhere
- the CUDA torch index for Linux and Windows under `uv tool install`

### 2026-11-26 11:37 UTC
- **Progress:** ☑ Checked (Requirements): README and the toolbar's no-server message point to the install command

### 2026-11-26 11:37 UTC
- **Progress:** ☑ Checked (Requirements): Toolbar checks every 2s while waiting on the server, 15s otherwise

### 2026-11-26 11:37 UTC
- **Progress:** ☑ Checked (Requirements): Health answers before the model is loaded; Kokoro loads on the first synthesis

### 2026-11-26 11:37 UTC
- **Progress:** ☑ Checked (Requirements): One documented command installs the server as a tool with a read-aloud-server entry point

### 2026-11-26 11:30 UTC

- **Progress:** Started work

### 2026-11-26 11:30 UTC

- **Note:** Item created
