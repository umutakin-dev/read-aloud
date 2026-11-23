// Covers the Firefox background page: offscreen.js and background.js loaded
// into ONE context, in manifest order, the way background.scripts loads them.
//
// Firefox has no offscreen API, so the player runs in the background page
// itself. There, runtime.sendMessage never reaches the sending page's own
// listeners — every path between background.js and the player has to be a
// direct call, and this suite fails if any of them still goes by message.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const EXTENSION = path.join(__dirname, "..", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, "manifest.json"), "utf8"));
const read = (file) => fs.readFileSync(path.join(EXTENSION, file), "utf8");

function load() {
  const calls = [];
  const listeners = {};
  const runtimeListeners = [];
  const audios = [];
  const stored = {};

  class FakeAudio {
    constructor(url) {
      this.src = url;
      this.paused = true;
      this.currentTime = 0;
      this.readyState = 1;
      audios.push(this);
    }
    load() {}
    play() {
      this.paused = false;
      calls.push("audio:play");
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      calls.push("audio:pause");
    }
    addEventListener() {}
  }

  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener: (fn) => runtimeListeners.push(fn) },
      getURL: (p) => `moz-extension://stub/${p}`,
      // Firefox: a message from this page never reaches this page.
      sendMessage: (msg) => {
        calls.push(`runtime.sendMessage:${msg.type}`);
        return Promise.reject(new Error("Could not establish connection."));
      },
      lastError: undefined,
    },
    contextMenus: { create() {}, onClicked: { addListener() {} } },
    commands: { onCommand: { addListener() {} } },
    tabs: {
      onRemoved: { addListener: (fn) => (listeners.tabRemoved = fn) },
      sendMessage: async (tabId, msg) => {
        calls.push(`tab${tabId}:${msg.type}`);
      },
    },
    scripting: { insertCSS: async () => {}, executeScript: async () => {} },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
    },
    storage: {
      session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      local: {
        get: async (key) => (key in stored ? { [key]: stored[key] } : {}),
        set: async (values) => Object.assign(stored, values),
        remove: async (key) => delete stored[key],
      },
    },
    // No chrome.offscreen and no runtime.getContexts: Firefox has neither.
  };

  const sandbox = {
    chrome,
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: async () => {},
    AbortController,
    atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
    Uint8Array,
    Blob: class {},
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
    Audio: FakeAudio,
  };
  vm.createContext(sandbox);
  for (const file of manifest.background.scripts) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }

  // What the content script sends: dispatched to every listener in the page,
  // as Firefox does for a message from another context.
  const fromTab = (message) =>
    new Promise((resolve) => {
      let async = false;
      for (const fn of runtimeListeners) {
        if (fn(message, { tab: { id: 7 } }, resolve) === true) async = true;
      }
      if (!async) resolve(undefined);
    });

  return { calls, listeners, fromTab, audios };
}

const settle = () => new Promise((r) => setTimeout(r, 10));
const AUDIO = Buffer.from("wav-bytes").toString("base64");

test("Firefox background page", async (t) => {
  await t.test("the manifest loads the player before background.js", () => {
    const scripts = manifest.background.scripts;
    assert.ok(scripts.indexOf("offscreen.js") < scripts.indexOf("background.js"), scripts.join(", "));
  });

  await t.test("plays audio in the page itself", async () => {
    const { calls, fromTab } = load();
    const response = await fromTab({ type: "PLAY_AUDIO", key: 0, audio_base64: AUDIO, speed: 1 });
    assert.equal(response.ok, true);
    assert.ok(calls.includes("audio:play"), calls.join(" "));
    assert.ok(!calls.some((c) => c.startsWith("runtime.sendMessage")), calls.join(" "));
  });

  await t.test("plays a preloaded chunk by key", async () => {
    const { fromTab } = load();
    await fromTab({ type: "PLAY_AUDIO", key: 0, audio_base64: AUDIO, speed: 1 });
    await fromTab({ type: "PRELOAD_AUDIO", key: 1, audio_base64: AUDIO });
    const response = await fromTab({ type: "PLAY_AUDIO", key: 1, speed: 1 });
    assert.equal(response.usedPreload, true);
  });

  await t.test("relays the end of a chunk to the reading tab", async () => {
    const { calls, fromTab, audios } = load();
    await fromTab({ type: "PLAY_AUDIO", key: 0, audio_base64: AUDIO, speed: 1 });
    audios.at(-1).onended();
    await settle();
    assert.ok(calls.includes("tab7:AUDIO_ENDED"), calls.join(" "));
  });

  await t.test("pauses and resumes the same audio", async () => {
    const { calls, fromTab } = load();
    await fromTab({ type: "PLAY_AUDIO", key: 0, audio_base64: AUDIO, speed: 1 });
    await fromTab({ type: "PAUSE_AUDIO" });
    await settle();
    assert.ok(calls.includes("audio:pause"), calls.join(" "));
    const response = await fromTab({ type: "RESUME_AUDIO" });
    assert.equal(response.resumed, true);
  });

  await t.test("resume after the page was unloaded asks for a replay", async () => {
    // Firefox suspends an idle event page, losing the audio element, exactly
    // as Chrome discards an idle offscreen document.
    const { fromTab } = load();
    const response = await fromTab({ type: "RESUME_AUDIO" });
    assert.equal(response.resumed, false);
  });

  await t.test("closing the reading tab stops the audio", async () => {
    const { calls, fromTab, listeners } = load();
    await fromTab({ type: "PLAY_AUDIO", key: 0, audio_base64: AUDIO, speed: 1 });
    await listeners.tabRemoved(7);
    assert.ok(calls.includes("audio:pause"), calls.join(" "));
  });
});

test("the debug log in the Firefox background page (000052)", async (t) => {
  await t.test("the player's lines stay in the page and are never relayed to the tab", async () => {
    const { calls, fromTab, audios } = load();
    await fromTab({ type: "PLAY_AUDIO", key: 4, audio_base64: AUDIO, speed: 2 });
    audios.at(-1).currentTime = 12.345;
    audios.at(-1).onended();
    await settle();
    assert.ok(calls.includes("tab7:AUDIO_ENDED"), calls.join(" "));
    assert.ok(!calls.some((c) => c.endsWith(":LOG")), calls.join(" "));

    const log = await fromTab({ type: "GET_LOG" });
    assert.match(log.text, /player audio\.play key=4 preloaded=false/);
    assert.match(log.text, /player audio\.ended key=4 at=12\.35/);
    assert.match(log.text, /bg\.start player=inline/);
  });

  await t.test("records an audio error with its code", async () => {
    const { fromTab, audios } = load();
    await fromTab({ type: "PLAY_AUDIO", key: 2, audio_base64: AUDIO, speed: 1 });
    audios.at(-1).error = { code: 3, message: "decode failed" };
    audios.at(-1).onerror();
    const log = await fromTab({ type: "GET_LOG" });
    assert.match(log.text, /player audio\.error key=2 at=0 code=3 error="decode failed"/);
  });
});
