# Remember reading position across a reload

**Type:** ✨ Feature
**Status:** 📋 Backlog
**Priority:** 🟢 LOW
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000028

## Description

Reading state lives entirely in the content script, so it dies with the page. Reload, navigate away and back, or restart the browser, and a 219-paragraph article starts again from paragraph one with no way back except pressing Next a hundred times.

Long documents are exactly what this tool is for, which makes losing your place in one worse than it sounds.

**Approach:** keep the position per URL in `chrome.storage.local` — paragraph index plus a short text fingerprint of that paragraph. When a session starts on a URL with a saved position, offer to resume rather than jumping there silently; a reader who deliberately went back to the top should not be dragged forward.

The fingerprint matters because pages change. If the saved paragraph text no longer appears, the position is stale and should be discarded rather than trusted to still mean the same place. Entries should also expire, so storage does not accumulate one for every page ever read.


## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Position saved per URL as reading progresses
- [ ] Resume is offered, not forced
- [ ] Stale positions detected by fingerprint and discarded
- [ ] Old entries expire rather than accumulating
- [ ] Finishing a document clears its position

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Note:** Item created
