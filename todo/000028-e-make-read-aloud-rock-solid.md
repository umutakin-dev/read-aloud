# Make Read Aloud rock solid

**Type:** 👑 Epic
**Status:** 📋 Backlog
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

## Description

The code review epic (#000001) fixed 22 defects, but every one of them was verified by hand and by throwaway scripts that live in a scratchpad. Nothing in the repository stops any of them coming back — there is no `package.json`, no test directory, no CI. "Rock solid" is not a property of the current code, it is a property of being able to change the code without breaking it, and that does not exist yet.

Most of the subtle logic is pure and trivially testable: whitespace collapsing, chunk and paragraph mapping, URL splitting, token alignment, the CORS policy, the preload handshake, orphan detection. The tests for all of it were already written during the review; they are simply in the wrong place (#000029).

Alongside that, two real defects are visible in the merged code — a paragraph lookup that finds the wrong occurrence (#000031) and British voices being given American pronunciation (#000032) — plus four robustness gaps that a general audience will hit far sooner than a developer will: second tabs, single-page apps, reloads, and abandoned GPU work.


- #000029 🔧 Test suite for the logic that is easy to get subtly wrong
- #000030 🔧 Run the test suite on push and pull request
- #000031 🐛 Paragraph lookup matches the first occurrence, not the right one
- #000032 🐛 British voices are pronounced with American phonemes
- #000033 🐛 Reading in a second tab silently breaks the first
- #000034 🐛 Text index goes stale on single-page-app navigation
- #000035 ✨ Remember reading position across a reload
- #000036 🔧 Cancel in-flight synthesis when playback stops
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
- **Note:** Added #000036 Cancel in-flight synthesis when playback stops to Items

### 2026-08-03
- **Note:** Added #000035 Remember reading position across a reload to Items

### 2026-08-03
- **Note:** Added #000034 Text index goes stale on single-page-app navigation to Items

### 2026-08-03
- **Note:** Added #000033 Reading in a second tab silently breaks the first to Items

### 2026-08-03
- **Note:** Added #000032 British voices are pronounced with American phonemes to Items

### 2026-08-03
- **Note:** Added #000031 Paragraph lookup matches the first occurrence, not the right one to Items

### 2026-08-03
- **Note:** Added #000030 Run the test suite on push and pull request to Items

### 2026-08-03
- **Note:** Added #000029 Test suite for the logic that is easy to get subtly wrong to Items

### 2026-08-03

- **Note:** Item created
