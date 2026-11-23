// Covers extension/content.js by running the real file in a jsdom page under a
// stubbed chrome API, as background.test.js does for its file. The files run as
// scripts in the page's context, so textkit's top-level ReadAloudText is
// visible to content.js just as it is in the browser.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const EXT = path.join(__dirname, "..", "extension");
const read = (f) => fs.readFileSync(path.join(EXT, f), "utf8");
const TEXTKIT = read("lib/textkit.js");
const CONTENT = read("content.js");

const tick = () => new Promise((r) => setTimeout(r, 0));

// Loads content.js into a page. `engine` is what the background's health check
// reports. TTS requests are left unanswered, as they are while the browser
// engine is still downloading its model.
function loadPage({ engine = "server" } = {}) {
  const dom = new JSDOM("<!doctype html><body><p>Some page text.</p></body>", {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const listeners = [];
  const sent = [];

  window.chrome = {
    runtime: {
      id: "stub",
      lastError: undefined,
      onMessage: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1),
      },
      sendMessage: (msg, cb) => {
        sent.push(msg.type);
        if (msg.type === "HEALTH_CHECK") cb({ ok: true, engine, setting: "auto" });
        else if (msg.type !== "TTS_REQUEST") cb({ ok: true });
      },
    },
    storage: {
      local: { get: async () => ({}) },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
  window.speechSynthesis = { cancel() {}, pause() {}, resume() {}, speak() {} };
  window.CSS = window.CSS || {};

  // The toolbar's shadow root is closed; keep a handle to it.
  let shadow = null;
  const attach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function (init) {
    shadow = attach.call(this, init);
    return shadow;
  };

  const context = dom.getInternalVMContext();
  new vm.Script(TEXTKIT).runInContext(context);
  new vm.Script(CONTENT).runInContext(context);

  return {
    window,
    sent,
    dispatch: (msg) => listeners.slice().forEach((fn) => fn(msg, {}, () => {})),
    engineLabel: () => shadow?.getElementById("engine")?.textContent,
    status: () => shadow?.getElementById("status")?.textContent,
    close: () => {
      window.__readAloudTeardown?.();
      window.close();
    },
  };
}

async function startReading(page) {
  page.dispatch({
    type: "TOGGLE_READ_ALOUD",
    selectedText: "A paragraph long enough to be read aloud by the extension.",
  });
  for (let i = 0; i < 5; i++) await tick();
}

test("the toolbar's engine label (000051)", async (t) => {
  await t.test("follows the browser engine once its model starts downloading", async () => {
    // The health check last saw the server; the popup has since switched to
    // this browser, so the next chunk goes to the browser engine.
    const page = loadPage({ engine: "server" });
    try {
      await startReading(page);
      assert.equal(page.engineLabel(), "Kokoro · server");
      assert.ok(page.sent.includes("TTS_REQUEST"), page.sent.join(" "));

      page.dispatch({ type: "ENGINE_PROGRESS", phase: "download", percent: 30 });

      assert.equal(page.engineLabel(), "Kokoro · browser");
      assert.equal(page.status(), "Downloading the voice model, one time only: 30%");
    } finally {
      page.close();
    }
  });

  await t.test("follows it while a cached model loads, too", async () => {
    const page = loadPage({ engine: "server" });
    try {
      await startReading(page);
      page.dispatch({ type: "ENGINE_PROGRESS", phase: "load" });
      assert.equal(page.engineLabel(), "Kokoro · browser");
    } finally {
      page.close();
    }
  });

  await t.test("progress before reading starts changes nothing", async () => {
    const page = loadPage({ engine: "server" });
    try {
      page.dispatch({ type: "ENGINE_PROGRESS", phase: "download", percent: 10 });
      assert.equal(page.engineLabel(), undefined);
    } finally {
      page.close();
    }
  });
});
