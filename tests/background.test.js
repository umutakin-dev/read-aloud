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
function load({
  tabMessage,
  inject,
  offscreenExists = false,
  offscreenReply,
  settings = {},
  serverUp = false,
} = {}) {
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
      local: {
        get: async (keys) => {
          const wanted = typeof keys === "string" ? [keys] : keys ?? Object.keys(settings);
          return Object.fromEntries(wanted.filter((k) => k in settings).map((k) => [k, settings[k]]));
        },
        set: async (values) => Object.assign(settings, values),
        remove: async (key) => delete settings[key],
      },
    },
    offscreen: { createDocument: async () => {}, closeDocument: async () => {} },
  };

  // The local server: up answers health and synthesis, down refuses.
  const fetch = async (url) => {
    calls.push(`fetch:${new URL(url).pathname}`);
    if (!serverUp) throw new Error("connection refused");
    return {
      ok: true,
      json: async () =>
        url.endsWith("/api/health")
          ? { status: "ok", engine: "kokoro" }
          : { audio_base64: "SERVER", timestamps: [] },
    };
  };

  const sandbox = { chrome, console, setTimeout, clearTimeout, fetch, AbortController };
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
      "executeScript:lib/textkit.js,lib/record.js,content.js",
      "tab:TOGGLE_READ_ALOUD",
    ]);
  });

  await t.test("injects textkit and the record before content.js", async () => {
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
    assert.ok(
      executed.indexOf("lib/record.js") < executed.indexOf("content.js"),
      `content.js reads ReadAloudRecord at load: ${executed.join(", ")}`
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

test("choosing an engine", async (t) => {
  const ask = (listeners, message) =>
    new Promise((resolve) => listeners.message(message, { tab: { id: 7 } }, resolve));

  // The browser engine lives with the player; it answers ENGINE_* messages.
  const player = (msg) => {
    if (msg.type === "ENGINE_SYNTHESIZE") return { ok: true, data: { audio_base64: "BROWSER" } };
    if (msg.type === "ENGINE_SUPPORTED") return { ok: true, supported: true };
    return { ok: true };
  };

  await t.test("auto uses the server when it answers", async () => {
    const { listeners } = load({ serverUp: true, offscreenReply: player });
    const response = await ask(listeners, { type: "TTS_REQUEST", text: "Hi." });
    assert.equal(response.engine, "server");
    assert.equal(response.data.audio_base64, "SERVER");
  });

  await t.test("auto falls back to the browser engine when the server is down", async () => {
    const { listeners, calls } = load({ serverUp: false, offscreenReply: player });
    const response = await ask(listeners, { type: "TTS_REQUEST", text: "Hi." });
    assert.equal(response.engine, "browser");
    assert.equal(response.data.audio_base64, "BROWSER");
    assert.ok(calls.includes("offscreen:ENGINE_SYNTHESIZE"), calls.join(" "));
  });

  await t.test("browser never asks the server", async () => {
    const { listeners, calls } = load({
      settings: { engine: "browser" },
      serverUp: true,
      offscreenReply: player,
    });
    const response = await ask(listeners, { type: "TTS_REQUEST", text: "Hi." });
    assert.equal(response.engine, "browser");
    assert.ok(!calls.some((c) => c.startsWith("fetch:")), calls.join(" "));
  });

  await t.test("server never falls back to the browser engine", async () => {
    const { listeners, calls } = load({
      settings: { engine: "server" },
      serverUp: false,
      offscreenReply: player,
    });
    const response = await ask(listeners, { type: "TTS_REQUEST", text: "Hi." });
    assert.equal(response.ok, false);
    assert.ok(!calls.includes("offscreen:ENGINE_SYNTHESIZE"), calls.join(" "));
  });

  await t.test("health in auto mode is ok on the browser engine alone", async () => {
    const { listeners } = load({ serverUp: false, offscreenReply: player });
    const health = await ask(listeners, { type: "HEALTH_CHECK" });
    assert.deepEqual([health.ok, health.engine], [true, "browser"]);
  });

  await t.test("health says why when nothing can speak", async () => {
    // No server, and a browser without WebGPU: the toolbar waits, and says so.
    const { listeners } = load({
      serverUp: false,
      offscreenReply: (msg) =>
        msg.type === "ENGINE_SUPPORTED"
          ? { ok: true, supported: false, reason: "WebGPU is not available in this browser" }
          : { ok: true },
    });
    const health = await ask(listeners, { type: "HEALTH_CHECK" });
    assert.equal(health.ok, false);
    assert.match(health.reason, /WebGPU/);
  });

  await t.test("voices come from the browser engine without asking the server", async () => {
    const { listeners, calls } = load({
      settings: { engine: "browser" },
      offscreenReply: (msg) =>
        msg.type === "ENGINE_VOICES" ? { ok: true, voices: [{ id: "af_heart" }] } : { ok: true },
    });
    const response = await ask(listeners, { type: "GET_VOICES" });
    assert.deepEqual(response.voices, [{ id: "af_heart" }]);
    assert.ok(!calls.some((c) => c.startsWith("fetch:")), calls.join(" "));
  });

  await t.test("engine progress is relayed to the reading tab", async () => {
    const { listeners, calls } = load({ serverUp: false, offscreenReply: player });
    await ask(listeners, { type: "TTS_REQUEST", text: "Hi." });
    listeners.message({ type: "ENGINE_PROGRESS", phase: "download", percent: 40 }, {}, () => {});
    await settle();
    assert.ok(calls.includes("tab:ENGINE_PROGRESS"), calls.join(" "));
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

test("the debug log (000052)", async (t) => {
  const ask = (listeners, message, sender = { tab: { id: 7 } }) =>
    new Promise((resolve) => listeners.message(message, sender, resolve));
  const lines = (response) => response.text.split("\n").filter(Boolean);

  await t.test("records what the tab sends, with the tab it came from", async () => {
    const { listeners } = load();
    listeners.message({ type: "LOG", src: "tab", ev: "chunk.request", chunk: 3, text: "A short preview" }, { tab: { id: 7 } }, () => {});
    const log = await ask(listeners, { type: "GET_LOG" });
    const line = lines(log).find((l) => l.includes("chunk.request"));
    assert.ok(line, log.text);
    assert.match(line, /tab=7/);
    assert.match(line, /chunk=3/);
    assert.match(line, /text="A short preview"/);
  });

  await t.test("notes each start of the background, since memory was lost there", async () => {
    const { listeners } = load();
    const log = await ask(listeners, { type: "GET_LOG" });
    assert.match(log.text, /bg\s+bg\.start player=offscreen/);
  });

  await t.test("keeps what earlier runs of the background saved", async () => {
    const earlier = { t: "2026-11-23T10:00:00.000Z", src: "player", ev: "audio.error", error: "decode" };
    const { listeners } = load({ settings: { debugLog: [earlier] } });
    const log = await ask(listeners, { type: "GET_LOG" });
    assert.match(lines(log)[0], /player audio\.error error=decode/);
    assert.equal(log.count, 2);
  });

  await t.test("is capped, dropping the oldest", async () => {
    const full = Array.from({ length: 2000 }, (_, i) => ({ t: "x", src: "tab", ev: `old.${i}` }));
    const { listeners } = load({ settings: { debugLog: full } });
    const log = await ask(listeners, { type: "GET_LOG" });
    assert.equal(log.count, 2000);
    assert.ok(!log.text.includes("old.0\n"), "the oldest entry should be gone");
    assert.match(lines(log).at(-1), /bg\.start/);
  });

  await t.test("logs each synthesis with its engine, time and size", async () => {
    const { listeners } = load({ serverUp: true });
    await ask(listeners, { type: "TTS_REQUEST", text: "Hello there." });
    const log = await ask(listeners, { type: "GET_LOG" });
    assert.match(log.text, /synth\.done engine=server ms=\d+ chars=12/);
  });

  await t.test("logs a failed synthesis with its error", async () => {
    const { listeners } = load({ settings: { engine: "server" }, serverUp: false });
    await ask(listeners, { type: "TTS_REQUEST", text: "Hello." });
    const log = await ask(listeners, { type: "GET_LOG" });
    assert.match(log.text, /synth\.fail engine=server .*error="connection refused"/);
  });

  await t.test("clears on request", async () => {
    const { listeners } = load();
    listeners.message({ type: "LOG", src: "tab", ev: "something" }, {}, () => {});
    await ask(listeners, { type: "CLEAR_LOG" });
    const log = await ask(listeners, { type: "GET_LOG" });
    assert.equal(log.count, 0);
  });
});

test("the toggle path in the debug log", async (t) => {
  const ask = (listeners, message) =>
    new Promise((resolve) => listeners.message(message, { tab: { id: 7 } }, resolve));

  await t.test("says the shortcut arrived, and why reading could not start", async () => {
    const { listeners } = load({
      inject: () => {
        throw new Error("Cannot access contents of the page");
      },
    });
    await listeners.command("toggle-read-aloud", { id: 7 });
    await settle();
    const { text } = await ask(listeners, { type: "GET_LOG" });
    assert.match(text, /toggle via=shortcut tab=7/);
    assert.match(text, /toggle\.fail tab=7 error="?Cannot access contents of the page/);
  });

  await t.test("names the menu when reading starts from it", async () => {
    const { listeners } = load();
    await listeners.contextMenu({ menuItemId: "read-aloud", selectionText: "" }, { id: 7 });
    await settle();
    const { text } = await ask(listeners, { type: "GET_LOG" });
    assert.match(text, /toggle via=menu tab=7/);
  });
});
