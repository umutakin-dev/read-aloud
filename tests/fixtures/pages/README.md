# Saved pages for the extractor tests

`tests/pages.test.js` reads these the way the extension reads a live page
(000058). Each was saved on 2026-11-24 and stripped of scripts, styles,
images and attributes the extractor never reads, so only structure and text
remain.

| File | Source | License |
|---|---|---|
| `wikipedia.html` | en.wikipedia.org/wiki/Speech_synthesis | CC BY-SA 4.0, Wikipedia contributors |
| `mdn.html` | developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API | CC BY-SA 2.5, Mozilla Contributors |
| `goblog.html` | go.dev/blog/go1.22 | CC BY 4.0, The Go Authors |
| `wikinews.html` | en.wikinews.org/wiki/Roblox_player_uncovers_cheating,_awarded_Guinness_World_Record | CC BY 2.5, Wikinews contributors |
| `hackernews.html` | Hacker News's comment-page markup, with text written for this test | ours |

Hacker News comments belong to their authors, so that fixture copies only the
markup of a real thread and carries text of our own.

To add a site: save the page, strip it the same way, and add a test naming
what a listener should hear and what they should not.
