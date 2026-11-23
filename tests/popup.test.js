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
async function openPopup(options) {
  const window = await loadPopup(options);
  return window.document.getElementById("shortcut-hint");
}

// `reply` answers runtime messages; by default every one fails, which is what
// the popup sees with no background to talk to.
async function loadPopup({
  platform = "MacIntel",
  shortcut = "Ctrl+Shift+U",
  commands = true,
  reply = () => ({ ok: false }),
} = {}) {
  const dom = new JSDOM(HTML, { runScripts: "outside-only" });
  const { window } = dom;
  Object.defineProperty(window.navigator, "platform", { value: platform });
  window.chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: {
      sendMessage: (msg, cb) => cb(reply(msg)),
      getManifest: () => ({ version: "9.9.9" }),
    },
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
  return window;
}

test("the popup's shortcut hint (000050)", async (t) => {
  await t.test("names Command on a Mac, where Firefox reports Ctrl", async () => {
    const hint = await openPopup({ platform: "MacIntel", shortcut: "Ctrl+Shift+U" });
    assert.equal(hint.querySelector("kbd").textContent, "Command+Shift+U");
  });

  await t.test("names Control for Firefox's MacCtrl on a Mac", async () => {
    const hint = await openPopup({ platform: "MacIntel", shortcut: "MacCtrl+Shift+U" });
    assert.equal(hint.querySelector("kbd").textContent, "Control+Shift+U");
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

test("the popup's debug log buttons (000052)", async (t) => {
  // jsdom has no object URLs or downloads: capture the blob and the click.
  function captureDownload(window) {
    const saved = {};
    window.URL.createObjectURL = (blob) => {
      saved.blob = blob;
      return "blob:log";
    };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {
      saved.name = this.download;
      saved.href = this.href;
    };
    return saved;
  }

  await t.test("Download saves the background's log as a text file", async () => {
    const asked = [];
    const window = await loadPopup({
      reply: (msg) => {
        asked.push(msg.type);
        return msg.type === "GET_LOG"
          ? { ok: true, count: 2, text: "line one\nline two" }
          : { ok: false };
      },
    });
    const saved = captureDownload(window);
    window.document.getElementById("btn-download-log").click();
    await new Promise((r) => setTimeout(r, 0));

    assert.ok(asked.includes("GET_LOG"), asked.join(" "));
    assert.match(saved.name, /^read-aloud-log-\d{8}-\d{4}\.txt$/);
    // jsdom's Blob has no text(); FileReader reads it.
    const text = await new Promise((resolve) => {
      const reader = new window.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(saved.blob);
    });
    assert.match(text, /^Read Aloud 9\.9\.9 debug log, 2 events\n/);
    assert.match(text, /line one\nline two\n$/);
    // Ends the popup's timer for revoking the URL.
    window.close();
  });

  await t.test("Download says so when the log cannot be read", async () => {
    const window = await loadPopup();
    const saved = captureDownload(window);
    const button = window.document.getElementById("btn-download-log");
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(saved.blob, undefined);
    assert.equal(button.textContent, "Couldn't read the log");
  });

  await t.test("Clear asks the background to clear it", async () => {
    const asked = [];
    const window = await loadPopup({
      reply: (msg) => (asked.push(msg.type), { ok: msg.type === "CLEAR_LOG" }),
    });
    window.document.getElementById("btn-clear-log").click();
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(asked.includes("CLEAR_LOG"), asked.join(" "));
    assert.equal(window.document.getElementById("btn-clear-log").textContent, "Cleared");
    window.close();
  });
});
