# Click a paragraph to start reading from there

**Type:** ✨ Feature
**Status:** 📋 Backlog
**Priority:** 🔴 HIGH
**Tracked In:** local
**Created:** 2026-08-03

**Parent:** 000037

## Description

The only way to reach a specific paragraph is to press Next until you arrive. On a 219-paragraph Stanford Encyclopedia entry that is not navigation, it is a hostage situation. Skipping the preamble of an article — the most ordinary thing a reader does — is currently impractical.

The biggest interaction win available, and cheap, because the machinery already exists. `state.textIndex` maps every character of the collapsed page text back to a DOM node and offset. Clicking anywhere gives a node and offset; running that mapping backwards gives a character position, and `state.chunks` plus `state.paragraphStarts` turn that into a paragraph.

Roughly: on click while a session is active, resolve the position, find the chunk containing it, jump there. The lookup wants an index from node to character position, which is the reverse of what `buildTextIndex` builds and can be assembled in the same pass.

The design question is how to invoke it without stealing ordinary clicks — links, text selection, buttons. Options: a modifier (Alt-click), a hover affordance on the paragraph under the cursor, or only treating clicks inside already-extracted paragraphs as navigation. Probably the last, with a hover cue so it is discoverable, and never on an element the page itself handles.

Pairs naturally with #000040, since both are about knowing and controlling where you are in a document.


## Estimation

- **Start:**
- **End:**
- **Effort:**

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Clicking a readable paragraph starts reading from it
- [ ] Links, buttons and text selection still behave normally
- [ ] A hover cue makes it discoverable
- [ ] Works while playing and while paused
- [ ] Node-to-character lookup built alongside the existing text index
- [ ] Reachable from the keyboard too, per #000038

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-08-03

- **Note:** Item created
