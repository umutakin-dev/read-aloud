// Covers extension/background.js by loading it under a stubbed chrome API and
// driving its listeners. Loading the real file rather than extracting pieces
// from it means these break when the file changes, which is the point.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "extension", "background.js"),
  "utf8"
);

const NOT_FOUND = "Could not establish connection. Receiving end does not exist.";

// `calls` records what crossed the extension boundary, in order.
function load({ tabMessage, inject, offscreenExists = false, offscreenReply } = {}) {
  const calls = [];
  const listeners = {};

  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener: (fn) => (listeners.message = fn) },
      getURL: (p) => `chrome-extension://stub/${p}`,
      getContexts: async () => (offscreenExists ? [{ contextType: "OFFSCREEN_DOCUMENT" }] : []),
      sendMessage: (msg, cb) => {
        calls.push(`offscreen:${msg.type}`);
        const reply = offscreenReply ? offscreenReply(msg) : { ok: true };
        if (cb) cb(reply);
        return Promise.resolve(reply);
      },
      lastError: undefined,
    },
    contextMenus: {
      create() {},
      onClicked: { addListener: (fn) => (listeners.contextMenu = fn) },
    },
    commands: { onCommand: { addListener: (fn) => (listeners.command = fn) } },
    tabs: {
      onRemoved: { addListener: (fn) => (listeners.tabRemoved = fn) },
      sendMessage: async (tabId, msg) => {
        calls.push(`tab:${msg.type}`);
        if (tabMessage) return tabMessage();
        throw new Error(NOT_FOUND);
      },
    },
    scripting: {
      insertCSS: async ({ files }) => {
        calls.push(`insertCSS:${files.join(",")}`);
        if (inject) return inject();
      },
      executeScript: async ({ files }) => {
        calls.push(`executeScript:${files.join(",")}`);
        if (inject) return inject();
      },
    },
    action: {
      setBadgeText: async ({ text }) => {
        if (text) calls.push("badge");
      },
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
    },
    storage: {
      session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      local: { get: async () => ({}) },
    },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
  };

  const sandbox = { chrome, console, setTimeout, clearTimeout, fetch: async () => {}, AbortController };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: "background.js" });
  return { calls, listeners, sandbox };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

test("invoking Read Aloud on a tab", async (t) => {
  await t.test("messages a live content script without injecting again", async () => {
    // A second press is a toggle-off, not a reason to inject a duplicate.
    const { calls, listeners } = load({ tabMessage: async () => undefined });
    await listeners.command("toggle-read-aloud", { id: 7 });
    await settle();
    assert.deepEqual(calls, ["tab:TOGGLE_READ_ALOUD"]);
  });

  await t.test("injects and retries when nothing is listening", async () => {
    // A tab open since before the extension loaded has no content script.
    let attempt = 0;
    const { calls, listeners } = load({
      tabMessage: async () => {
        if (++attempt === 1) throw new Error(NOT_FOUND);
        return undefined;
      },
    });
    await listeners.command("toggle-read-aloud", { id: 7 });
    await settle();
    assert.deepEqual(calls, [
      "tab:TOGGLE_READ_ALOUD",
      "insertCSS:content.css",
      "executeScript:lib/Readability.js,lib/textkit.js,content.js",
      "tab:TOGGLE_READ_ALOUD",
    ]);
  });

  await t.test("injects textkit before content.js", async () => {
    let attempt = 0;
    const { calls, listeners } = load({
      tabMessage: async () => {
        if (++attempt === 1) throw new Error(NOT_FOUND);
        return undefined;
      },
    });
    await listeners.command("toggle-read-aloud", { id: 7 });
    await settle();
    const executed = calls.find((c) => c.startsWith("executeScript:")).split(":")[1].split(",");
    assert.ok(
      executed.indexOf("lib/textkit.js") < executed.indexOf("content.js"),
      `content.js reads ReadAloudText at load: ${executed.join(", ")}`
    );
  });

  await t.test("badges a page that cannot be scripted", async () => {
    // chrome:// URLs, the PDF viewer, the Web Store.
    const { calls, listeners } = load({
      inject: () => {
        throw new Error("Cannot access contents of the page");
      },
    });
    await listeners.command("toggle-read-aloud", { id: 7 });
    await settle();
    assert.ok(calls.includes("badge"));
  });

  await t.test("badges rather than looping when injection does not take", async () => {
    const { calls, listeners } = load();
    await listeners.command("toggle-read-aloud", { id: 7 });
    await settle();
    assert.equal(calls.at(-1), "badge");
    assert.equal(calls.filter((c) => c.startsWith("executeScript")).length, 1);
  });

  await t.test("does nothing without a tab", async () => {
    const { calls, listeners } = load();
    await listeners.command("toggle-read-aloud", undefined);
    await settle();
    assert.deepEqual(calls, []);
  });

  await t.test("the context menu takes the same path", async () => {
    const { calls, listeners } = load({ tabMessage: async () => undefined });
    await listeners.contextMenu({ menuItemId: "read-aloud" }, { id: 7 });
    await settle();
    assert.deepEqual(calls, ["tab:TOGGLE_READ_ALOUD"]);
  });
});

test("audio control relay", async (t) => {
  const play = (listeners, message) =>
    new Promise((resolve) => {
      listeners.message(message, { tab: { id: 7 } }, resolve);
    });

  await t.test("plays without creating the document when one answers", async () => {
    // getContexts costs a round trip, and this runs at every chunk boundary.
    const { calls, listeners } = load({ offscreenExists: true });
    const response = await play(listeners, { type: "PLAY_AUDIO", key: 3, audio_base64: "AA" });
    assert.deepEqual(response, { ok: true });
    assert.deepEqual(calls, ["offscreen:PLAY"]);
  });

  await t.test("creates the document and retries when nothing answers", async () => {
    let asked = 0;
    const { calls, listeners } = load({
      offscreenReply: () => (++asked === 1 ? null : { ok: true }),
    });
    const response = await play(listeners, { type: "PLAY_AUDIO", key: 3, audio_base64: "AA" });
    assert.deepEqual(response, { ok: true });
    assert.deepEqual(calls, ["offscreen:PLAY", "offscreen:PLAY"]);
  });

  await t.test("reports that resume found nothing when the document is gone", async () => {
    // Chrome discards an AUDIO_PLAYBACK document once it stops playing, so a
    // long pause leaves nothing to resume and the client must replay instead.
    const { listeners } = load({ offscreenExists: false });
    const response = await play(listeners, { type: "RESUME_AUDIO" });
    assert.equal(response.resumed, false);
  });

  await t.test("forwards resume when the document is still there", async () => {
    const { listeners, calls } = load({
      offscreenExists: true,
      offscreenReply: () => ({ resumed: true }),
    });
    const response = await play(listeners, { type: "RESUME_AUDIO" });
    assert.equal(response.resumed, true);
    assert.deepEqual(calls, ["offscreen:RESUME"]);
  });

  await t.test("drops control messages when there is no document", async () => {
    const { calls, listeners } = load({ offscreenExists: false });
    listeners.message({ type: "PAUSE_AUDIO" }, {}, () => {});
    await settle();
    assert.deepEqual(calls, []);
  });
});
