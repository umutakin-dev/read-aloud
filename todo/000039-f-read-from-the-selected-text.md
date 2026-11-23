# Read from the selected text

**Type:** ✨ Feature
**Status:** 📋 Backlog
**Priority:** 🔴 HIGH
**Roadmap:** 🎯 NOW 2
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

- **Start:** 2026-11-24
- **End:** 2026-11-25
- **Effort:** ~5h (p75 5h)

## Actual

- **Start:**
- **End:**
- **Effort:**

## Requirements

- [ ] Works while playing and while paused
- [ ] Node-to-character lookup built alongside the existing text index
- [ ] Reachable from the keyboard too, per #000038
- [ ] A popup setting, on by default, turns read-from-selection off
- [ ] Selecting text while paused jumps there and stays paused
- [ ] A ready sentence plays at once; an unready one is synthesized first
- [ ] Selecting text inside the read text jumps to the sentence where the selection starts
- [ ] Selections outside the read text, and clicks on links and buttons, behave normally

## Checklist

- [ ] Design/approach decided
- [ ] Implementation complete
- [ ] Tested
- [ ] Code reviewed
- [ ] Documentation updated

## Log

### 2026-11-23 12:53 UTC
- **Decision:** Roadmap: (unscheduled) → 🎯 NOW 3

### 2026-11-23 12:53 UTC
- **Note:** Requirement removed: Links, buttons and text selection still behave normally

### 2026-11-23 12:53 UTC
- **Note:** Requirement removed: A hover cue makes it discoverable

### 2026-11-23 12:53 UTC
- **Note:** Requirement removed: Clicking a readable paragraph starts reading from it

### 2026-11-23 12:52 UTC
- **Decision:** Umut, 2026-11-23: selecting text inside the article jumps reading to the sentence where the selection starts. A popup setting turns it off, on by default. While paused, it jumps and stays paused. A ready sentence plays at once; otherwise it is synthesized first and the background synthesis continues from there (000053). Built on 000053.

### 2026-11-23 12:52 UTC
- **Note:** Renamed: "Click a paragraph to start reading from there" → "Read from the selected text" — Umut chose selecting text over clicking; a selection never steals a click meant for a link

### 2026-08-03

- **Note:** Item created
