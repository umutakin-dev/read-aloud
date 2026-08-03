# Keyboard controls and screen reader support for the toolbar

**Type:** ✨ Feature
**Status:** 📋 Backlog
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
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Space pauses and resumes; arrows move by paragraph
- [ ] Shortcuts do not fire while a page input has focus
- [ ] Play/pause exposes its state via aria-pressed
- [ ] Toolbar is a labelled region, announced when it appears
- [ ] Status changes are announced through a live region
- [ ] Focus moves to the toolbar on open and returns on close
- [ ] Highlight colours meet contrast requirements on light and dark pages
- [ ] Verified with a screen reader, not only by inspection

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Note:** Item created
