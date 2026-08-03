# Package the server so it installs and runs itself

**Type:** 🔧 Task
**Status:** 📋 Backlog
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000024

## Description

**Only needed if #000025 concludes the browser cannot do it.** If Kokoro runs client-side this item is deleted, not deferred.

The fallback is to stop asking users to install a Python toolchain and instead ship something that installs itself. Two shapes:

- **Native messaging host.** Chrome launches the process on demand and talks to it over stdio, so there is no port, no CORS, no "keep a terminal open", and no orphaned server after the browser closes. It needs a per-platform installer to register the host manifest, and the extension ID has to be baked into that manifest.
- **A packaged binary the user runs.** Simpler to build, but leaves them managing a background process, which is most of the friction we are trying to remove.

Native messaging is the better answer for a general audience; the installer is the cost.

The hard part either way is the payload. Torch plus CUDA is measured in gigabytes, so a shipped artifact almost certainly means ONNX Runtime rather than torch — which converges with the work in #000025 regardless of where the model ends up running. Bundling espeak-ng, or removing the need for it, has to be solved here too.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Decision recorded: native messaging host or standalone binary
- [ ] Installer for Windows, macOS and Linux
- [ ] No Python, uv or espeak-ng install required of the user
- [ ] Artifact size is defensible for a general download
- [ ] Nothing is left running after the browser closes
- [ ] GPU used when present, CPU when not, without the user choosing

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Note:** Item created
