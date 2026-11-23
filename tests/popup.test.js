// Covers extension/popup.js by loading the real popup.html and popup.js into
// jsdom under a stubbed chrome API, the same way background.test.js loads its
// file: these break when either file changes, which is the point.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const EXT = path.join(__dirname, "..", "extension");
const HTML = fs.readFileSync(path.join(EXT, "popup.html"), "utf8");
const SCRIPT = fs.readFileSync(path.join(EXT, "popup.js"), "utf8");

// Resolves once the popup has finished its startup work: settings, shortcut,
// and the first server check.
async function openPopup({ platform = "MacIntel", shortcut = "Ctrl+Shift+U", commands = true } = {}) {
  const dom = new JSDOM(HTML, { runScripts: "outside-only" });
  const { window } = dom;
  Object.defineProperty(window.navigator, "platform", { value: platform });
  window.chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { sendMessage: (msg, cb) => cb({ ok: false }) },
    permissions: { contains: async () => true, request: async () => true },
  };
  if (commands) {
    window.chrome.commands = {
      getAll: async () => [
        { name: "_execute_action", shortcut: "" },
        { name: "toggle-read-aloud", shortcut },
      ],
    };
  }
  window.eval(SCRIPT);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return window.document.getElementById("shortcut-hint");
}

test("the popup's shortcut hint (000050)", async (t) => {
  await t.test("shows Firefox's Ctrl as Command, in Chrome's symbols, on a Mac", async () => {
    const hint = await openPopup({ platform: "MacIntel", shortcut: "Ctrl+Shift+U" });
    assert.equal(hint.querySelector("kbd").textContent, "⇧⌘U");
  });

  await t.test("shows Firefox's MacCtrl as Control, in macOS order", async () => {
    const hint = await openPopup({ platform: "MacIntel", shortcut: "Shift+MacCtrl+U" });
    assert.equal(hint.querySelector("kbd").textContent, "⌃⇧U");
  });

  await t.test("shows Alt as Option on a Mac", async () => {
    const hint = await openPopup({ platform: "MacIntel", shortcut: "Alt+Ctrl+R" });
    assert.equal(hint.querySelector("kbd").textContent, "⌥⌘R");
  });

  await t.test("shows Chrome's Mac symbols as they come", async () => {
    const hint = await openPopup({ platform: "MacIntel", shortcut: "⇧⌘U" });
    assert.equal(hint.querySelector("kbd").textContent, "⇧⌘U");
  });

  await t.test("keeps Ctrl off a Mac", async () => {
    const hint = await openPopup({ platform: "Win32", shortcut: "Ctrl+Shift+U" });
    assert.equal(hint.querySelector("kbd").textContent, "Ctrl+Shift+U");
  });

  await t.test("shows a rebound shortcut, not the manifest's", async () => {
    const hint = await openPopup({ platform: "Linux x86_64", shortcut: "Alt+R" });
    assert.equal(hint.querySelector("kbd").textContent, "Alt+R");
  });

  await t.test("says how to set one when nothing is bound", async () => {
    const hint = await openPopup({ shortcut: "" });
    assert.equal(hint.querySelector("kbd"), null);
    assert.match(hint.textContent, /No keyboard shortcut is set/);
  });

  await t.test("stays empty without a commands API rather than guessing", async () => {
    const hint = await openPopup({ commands: false });
    assert.equal(hint.textContent.trim(), "");
  });
});
