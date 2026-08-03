# Chrome Web Store listing, privacy policy and permission justification

**Type:** 🔧 Task
**Status:** 📋 Backlog
**Priority:** 🟡 MEDIUM
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000024

## Description

Publishing needs paperwork that has nothing to do with the code, and reviewers reject on it routinely.

Read Aloud is in unusually good shape on the part reviewers scrutinise hardest — permissions. Moving the content script to on-demand injection (#000013) removed the `<all_urls>` match, and narrowing optional hosts to localhost (#000007) removed the wildcard, so the justifications are short and honest: `activeTab` because the user invokes it deliberately, `scripting` to inject on that invocation, `offscreen` because MV3 service workers cannot play audio, `storage` for settings, `contextMenus` for the right-click entry.

The privacy story is also genuinely strong and worth stating plainly rather than in boilerplate: page text is sent to a server on the user's own machine and nowhere else. If #000025 lands, it never leaves the browser at all. No analytics, no accounts, no remote endpoint.

Needed: a hosted privacy policy, store description, screenshots, a promo tile, a support contact, and a single-purpose statement. Also worth deciding now whether the first release is public or unlisted — unlisted lets real people use it by link while the install story settles.

## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Privacy policy written and hosted at a stable URL
- [ ] Justification written for each permission requested
- [ ] Single-purpose description that matches what it does
- [ ] Screenshots and promotional tile
- [ ] Support contact and issue reporting route
- [ ] Decision recorded: public or unlisted for the first release
- [ ] Developer account registered and fee paid

## Checklist

- [ ] Implementation complete
- [ ] Tested
- [ ] Verified

## Log

### 2026-08-03

- **Note:** Item created
