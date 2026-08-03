# Run the test suite on push and pull request

**Type:** 🔧 Task
**Status:** 📋 Backlog
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

- **Note:** Item created
