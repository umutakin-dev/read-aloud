# Run the test suite on push and pull request

**Type:** 🔧 Task
**Status:** 🔨 In Progress
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000028

## Description

`gh pr checks` on PR #2 reported "no checks reported on the branch" — nothing runs automatically. A suite that only runs when someone remembers is most of the way to no suite at all.

A GitHub Actions workflow on push and pull request, running the JavaScript and Python suites from #000029. Should also validate `manifest.json` parses and that the files it references exist — a stale entry there is exactly the class of bug #000008 was (a `web_accessible_resources` pointing at a file that had been deleted).

Deliberately out of scope: installing torch in CI. Multiple gigabytes for tests that never touch a GPU. The Python tests worth running are the pure ones — token alignment and the CORS policy — and both already run without importing the engine.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Workflow runs on push and on pull request
- [ ] JavaScript and Python suites both run
- [ ] manifest.json is validated, including that referenced files exist
- [ ] CI does not install torch
- [ ] A failing test blocks the merge

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03
- **Progress:** Workflow added: two jobs on push and pull request, Node 22/24 and Python 3.10/3.13, with concurrency cancelling superseded runs. Verified locally on every matrix leg. The Python job runs --no-project so uv never installs torch from the cu128 index — 23 tests in 0.16s instead of a 2.6GB download onto a runner with no GPU.

### 2026-08-03

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
