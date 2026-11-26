# Keyboard controls and screen reader support for the toolbar

**Type:** ✨ Feature
**Status:** 🔨 In Progress
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000037

## Description

This is a reading tool, so being awkward to use without a mouse or with a screen reader undercuts the point of it. That makes this less polish than the rest of #000037, which is why it sits at the top of it.

Where it stands: the toolbar controls are real `<button>` elements with `title` attributes, so they are focusable and carry an accessible name — the floor is met, not the bar. Nothing above that exists. A search of `content.js` and `popup.html` finds no `aria-*`, no `role`, no `tabindex`.

Missing:

- **Keyboard control beyond the toggle.** Ctrl+Shift+U starts and stops; everything else needs the mouse. Space to pause, arrows for previous and next paragraph, and speed adjustment would cover almost all real use — scoped so they never swallow a keystroke meant for a text field on the page.
- **`aria-pressed` on play/pause**, which currently communicates its state only through a glyph and a CSS class.
- **A labelled region.** The toolbar is an unnamed cluster of buttons appearing at the top of the page with no announcement that it exists.
- **A live region** for status. "Paragraph 3 of 198", "synthesizing", "server down" are visible only.
- **Focus management.** Nothing moves focus to the toolbar when it appears, or returns it sensibly when it closes.

Worth checking the highlight colours against contrast requirements too, and how they read on dark-themed sites — they are fixed values chosen against a light page.


## Estimation

- **Start:**
- **End:**
- **Effort:** ~19m (p75 57m)

## Actual

- **Start:** 2026-11-26 22:07 UTC
- **End:**
- **Effort:**

## Requirements

- [x] Space pauses and resumes; arrows move by paragraph
- [x] Shortcuts do not fire while a page input has focus
- [x] Play/pause exposes its state via aria-pressed
- [x] Toolbar is a labelled region, announced when it appears
- [x] Status changes are announced through a live region
- [x] Focus moves to the toolbar on open and returns on close
- [x] Highlight colours meet contrast requirements on light and dark pages
- [ ] Verified with a screen reader, not only by inspection

## Checklist

- [x] Design/approach decided
- [x] Implementation complete
- [x] Tested
- [ ] Code reviewed
- [x] Documentation updated

## Log

### 2026-11-26 22:21 UTC
- **Decision:** Keys act only while focus is in the toolbar (Umut, 2026-11-27): the toolbar takes focus on open, so they work at once, and the page keeps Space and the arrows for scrolling. Space is play/pause wherever focus is in the toolbar; Enter presses the focused button. Announcements are kept to play/pause, speed, the engine going or coming back and nothing to read, never the time left, which would talk over the reading.

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Checklist): Documentation updated

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Checklist): Tested

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Checklist): Implementation complete

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Checklist): Design/approach decided

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Requirements): Highlight colours meet contrast requirements on light and dark pages

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Requirements): Focus moves to the toolbar on open and returns on close

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Requirements): Status changes are announced through a live region

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Requirements): Toolbar is a labelled region, announced when it appears

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Requirements): Play/pause exposes its state via aria-pressed

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Requirements): Shortcuts do not fire while a page input has focus

### 2026-11-26 22:21 UTC
- **Progress:** ☑ Checked (Requirements): Space pauses and resumes; arrows move by paragraph

### 2026-11-26 22:07 UTC

- **Progress:** Started work

### 2026-08-03

- **Note:** Item created
