# Toolbar status shows time left and percent read, not a paragraph count

**Type:** 🔧 Task
**Status:** ✅ Done
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-11-26 07:15 UTC

## Description

The toolbar says 'Paragraph 3/119 · 31 min left'. The count includes headings, captions and list items, so on Wikipedia the title is paragraph 1, and 119 means nothing to a listener. Umut (2026-11-26) chose: '31 min left · 2%'. While dragging the bar, show the time left and percent at the drop point. Prev and Next keep moving by paragraph, which their tooltips can say.

## Estimation

- **Start:**
- **End:**
- **Effort:** ~9m (p75 1h12)

## Actual

- **Start:** 2026-11-26 07:12 UTC
- **End:** 2026-11-26 07:26 UTC
- **Effort:** 14m

## Requirements

- [x] Status reads '`<time>` left · `<n>`%', with no paragraph count
- [x] Dragging the bar previews time left and percent at the drop point
- [x] Before any audio is measured it shows the percent alone
- [x] The bar's aria-valuetext says the same; Prev and Next tooltips name paragraphs
- [x] Tests cover the label, the drag preview and the paused form

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-11-26 07:26 UTC

- **Progress:** Completed

### 2026-11-26 07:26 UTC
- **Progress:** Umut looked at it in the browser (2026-11-26): the wording is right.

### 2026-11-26 07:17 UTC
- **Progress:** Status is now labelAt(chars): '`<time>` left · `<n>`%', the percent alone until audio is measured; the drag preview shows the same at the drop point; retry, web-speech and paused labels use it; the slider refreshes it at once. Bar tooltip says time left is listening time at this speed. 353 tests pass, dist/ rebuilt.

### 2026-11-26 07:17 UTC
- **Progress:** ☑ Checked (Requirements): Tests cover the label, the drag preview and the paused form

### 2026-11-26 07:17 UTC
- **Progress:** ☑ Checked (Requirements): The bar's aria-valuetext says the same; Prev and Next tooltips name paragraphs

### 2026-11-26 07:17 UTC
- **Progress:** ☑ Checked (Requirements): Before any audio is measured it shows the percent alone

### 2026-11-26 07:17 UTC
- **Progress:** ☑ Checked (Requirements): Dragging the bar previews time left and percent at the drop point

### 2026-11-26 07:17 UTC
- **Progress:** ☑ Checked (Requirements): Status reads '`<time>` left · `<n>`%', with no paragraph count

### 2026-11-26 07:15 UTC

- **Progress:** Started work

### 2026-11-26 07:15 UTC
- **Note:** Dedup: read 000038 (toolbar keyboard and screen-reader support), 000057 (HN first paragraphs), 000033 (second tab breaks the first). None covers the status wording; 000040, which added the label, is closed.

### 2026-11-26 07:15 UTC

- **Note:** Item created
