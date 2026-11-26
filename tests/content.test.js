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
const RECORD = read("lib/record.js");
const CONTENT = read("content.js");

const tick = () => new Promise((r) => setTimeout(r, 0));

// Loads content.js into a page. `engine` is what the background's health check
// reports. TTS requests are left unanswered unless `tts` answers them, as they
// are while the browser engine is still downloading its model. `logs` collects
// the debug log lines the tab sends (000052). `health`, when given, answers
// each HEALTH_CHECK instead, so a test can change it between polls. Browser
// speech is recorded in `utterances`, and `poll()` runs the toolbar's 15s
// health poll on demand.
function loadPage({ engine = "server", tts, body = "<p>Some page text.</p>", settings = {}, health } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const listeners = [];
  const sent = [];
  const logs = [];
  const messages = [];

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
        messages.push(msg);
        if (msg.type === "LOG") logs.push(msg);
        if (msg.type === "HEALTH_CHECK") cb(health ? health() : { ok: true, engine, setting: "auto" });
        else if (msg.type === "TTS_REQUEST") {
          // A promise answers when it settles, so a test decides when each
          // sentence is ready.
          const answer = tts && tts(msg);
          if (answer && typeof answer.then === "function") answer.then(cb);
          else if (tts) cb(answer);
        }
        // The player answers a resume with whether it had anything to resume.
        else if (msg.type === "RESUME_AUDIO") cb({ resumed: true });
        else cb({ ok: true });
      },
    },
    storage: {
      local: { get: async () => ({ ...settings }) },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
  const utterances = [];
  window.speechSynthesis = { cancel() {}, pause() {}, resume() {}, speak: (u) => utterances.push(u) };
  window.SpeechSynthesisUtterance =
    window.SpeechSynthesisUtterance ||
    function SpeechSynthesisUtterance(text) {
      this.text = text;
    };
  window.CSS = window.CSS || {};

  const polls = [];
  const setIntervalReal = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...rest) => {
    if (ms === 15000) polls.push(fn);
    return setIntervalReal(fn, ms, ...rest);
  };

  // The toolbar's shadow root is closed; keep a handle to it.
  let shadow = null;
  const attach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function (init) {
    shadow = attach.call(this, init);
    return shadow;
  };

  const context = dom.getInternalVMContext();
  new vm.Script(TEXTKIT).runInContext(context);
  new vm.Script(RECORD).runInContext(context);
  new vm.Script(CONTENT).runInContext(context);

  return {
    window,
    sent,
    logs,
    messages,
    utterances,
    poll: () => Promise.all(polls.map((fn) => fn())),
    click: (id) => shadow.getElementById(id).click(),
    toolbarEl: (id) => shadow?.getElementById(id),
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

test("the tab's debug log lines (000052)", async (t) => {
  const LONG =
    "A paragraph long enough to be read aloud by the extension, and long enough " +
    "that only a preview of it should ever reach the log.";
  const start = async (page) => {
    page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: LONG });
    for (let i = 0; i < 5; i++) await tick();
  };
  const find = (page, ev) => page.logs.find((l) => l.ev === ev);

  await t.test("starting to read logs the session, by host only", async () => {
    const page = loadPage();
    try {
      await start(page);
      const started = find(page, "read.start");
      assert.ok(started, JSON.stringify(page.logs));
      assert.equal(started.src, "tab");
      assert.equal(started.chunks, 1);
      assert.equal(started.engine, "server");
      assert.equal(typeof started.host, "string");
      assert.ok(!("url" in started) && !("path" in started));
    } finally {
      page.close();
    }
  });

  await t.test("a chunk request carries its index and only a short preview", async () => {
    const page = loadPage();
    try {
      await start(page);
      const request = find(page, "chunk.request");
      assert.equal(request.chunk, 0);
      assert.equal(request.chars, LONG.length);
      assert.ok(request.text.length <= 41, request.text);
      assert.ok(LONG.startsWith(request.text.replace(/…$/, "")));
      assert.ok(!page.logs.some((l) => JSON.stringify(l).includes("only a preview of it")));
    } finally {
      page.close();
    }
  });

  await t.test("a failed synthesis logs the error and the retry", async () => {
    const page = loadPage({ tts: () => ({ ok: false, error: "engine exploded" }) });
    try {
      await start(page);
      for (let i = 0; i < 5; i++) await tick();
      assert.equal(find(page, "chunk.fail")?.error, "engine exploded");
      assert.equal(find(page, "chunk.error")?.chunk, 0);
      assert.ok(find(page, "chunk.retry"), JSON.stringify(page.logs.map((l) => l.ev)));
    } finally {
      page.close();
    }
  });

  await t.test("a ready chunk logs which engine made it and how long it took", async () => {
    const page = loadPage({
      tts: () => ({ ok: true, engine: "browser", data: { audio_base64: "AA", timestamps: [] } }),
    });
    try {
      await start(page);
      const ready = find(page, "chunk.ready");
      assert.equal(ready.engine, "browser");
      assert.equal(typeof ready.ms, "number");
      assert.deepEqual(
        [find(page, "engine.switch")?.from, find(page, "engine.switch")?.to],
        ["server", "browser"]
      );
    } finally {
      page.close();
    }
  });
});

test("reading a page sentence by sentence (000053)", async (t) => {
  // Three paragraphs, six sentences: indices 0-1, 2-3, 4-5.
  const TEXT = [
    "The first sentence is here. The second sentence follows it.",
    "The third sentence opens this one. The fourth sentence closes it.",
    "The fifth sentence begins the end. The sixth sentence is the last.",
  ].join("\n\n");

  const settle = async () => {
    for (let i = 0; i < 10; i++) await tick();
  };

  // TTS requests wait until the test answers them, one by one, in order.
  function deferredPage() {
    const pending = [];
    const page = loadPage({
      tts: (msg) =>
        new Promise((resolve) => {
          pending.push({
            text: msg.text,
            answer: () =>
              resolve({ ok: true, engine: "server", data: { audio_base64: `audio:${msg.text}`, timestamps: [] } }),
          });
        }),
    });
    const requested = () => page.messages.filter((m) => m.type === "TTS_REQUEST").map((m) => m.text);
    const plays = () => page.messages.filter((m) => m.type === "PLAY_AUDIO");
    const answerNext = async () => {
      pending.shift().answer();
      await settle();
    };
    const start = async () => {
      page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: TEXT });
      await settle();
    };
    return { page, pending, requested, plays, answerNext, start };
  }

  await t.test("asks for one sentence at a time, not a whole paragraph", async () => {
    const r = deferredPage();
    try {
      await r.start();
      assert.deepEqual(r.requested(), ["The first sentence is here."]);
    } finally {
      r.page.close();
    }
  });

  await t.test("starts playing as soon as the first sentence is ready", async () => {
    const r = deferredPage();
    try {
      await r.start();
      assert.equal(r.plays().length, 0);
      await r.answerNext();
      assert.equal(r.plays().length, 1);
      assert.equal(r.plays()[0].key, 0);
      // The next sentence is already on its way, and only that one.
      assert.equal(r.pending.length, 1);
      assert.match(r.pending[0].text, /second/);
    } finally {
      r.page.close();
    }
  });

  await t.test("synthesizes the whole page in the background, in order, one at a time", async () => {
    const r = deferredPage();
    try {
      await r.start();
      for (let i = 0; i < 6; i++) {
        assert.ok(r.pending.length <= 1, `${r.pending.length} requests in flight`);
        await r.answerNext();
      }
      assert.equal(r.pending.length, 0);
      assert.deepEqual(
        r.requested().map((text) => text.split(" ")[1]),
        ["first", "second", "third", "fourth", "fifth", "sixth"]
      );
      // Still on the first sentence: nothing has ended yet.
      assert.equal(r.plays().length, 1);
    } finally {
      r.page.close();
    }
  });

  await t.test("going back to a made sentence plays it with no synthesis", async () => {
    const r = deferredPage();
    try {
      await r.start();
      for (let i = 0; i < 6; i++) await r.answerNext();
      const before = r.requested().length;

      r.page.click("btn-next"); // paragraph 2, sentence 2
      await settle();
      r.page.click("btn-prev"); // at a paragraph start, so back to paragraph 1
      await settle();

      assert.equal(r.requested().length, before);
      const keys = r.plays().map((p) => p.key);
      assert.deepEqual(keys, [0, 2, 0]);
      // Not preloaded, so the audio travels with the play request.
      assert.equal(r.plays().at(-1).audio_base64, "audio:The first sentence is here.");
    } finally {
      r.page.close();
    }
  });

  await t.test("after a jump, makes the target first, then on to the end, then the gap", async () => {
    const r = deferredPage();
    try {
      await r.start();
      await r.answerNext(); // sentence 0 made and playing; 1 requested
      r.page.click("btn-next"); // to paragraph 2 (sentence 2) while 1 is in flight
      r.page.click("btn-next"); // and on to paragraph 3 (sentence 4)
      await settle();
      // The jump waits behind the one request already in flight, never more.
      assert.equal(r.pending.length, 1);
      assert.match(r.pending[0].text, /second/);
      for (let i = 0; i < 5; i++) await r.answerNext();
      assert.deepEqual(
        r.requested().map((text) => text.split(" ")[1]),
        ["first", "second", "fifth", "sixth", "third", "fourth"]
      );
      assert.equal(r.plays().at(-1).key, 4);
    } finally {
      r.page.close();
    }
  });

  await t.test("a jump while waiting does not let the old sentence play late", async () => {
    const r = deferredPage();
    try {
      await r.start(); // waiting on sentence 0
      r.page.click("btn-next"); // to sentence 2 before 0 is made
      await settle();
      for (let i = 0; i < 3; i++) await r.answerNext();
      assert.deepEqual(
        r.plays().map((p) => p.key),
        [2]
      );
    } finally {
      r.page.close();
    }
  });

  await t.test("plays on into the next sentence when one ends", async () => {
    const r = deferredPage();
    try {
      await r.start();
      await r.answerNext();
      await r.answerNext();
      r.page.dispatch({ type: "AUDIO_ENDED" });
      await settle();
      assert.deepEqual(
        r.plays().map((p) => p.key),
        [0, 1]
      );
      // Sentence 1 was preloaded while 0 played, so it goes without its audio.
      // The preload has to follow PLAY 0: the player drops any preload that is
      // not the sentence it is starting, and sent first, it was thrown away.
      const at = (type, key) => r.page.messages.findIndex((m) => m.type === type && m.key === key);
      assert.ok(at("PRELOAD_AUDIO", 1) > at("PLAY_AUDIO", 0), "preload sent before PLAY 0");
      assert.equal(r.plays()[1].audio_base64, undefined);
    } finally {
      r.page.close();
    }
  });

  await t.test("a failed sentence is not asked for again until playback tries it", async () => {
    let calls = 0;
    const page = loadPage({
      tts: () => {
        calls++;
        return { ok: false, error: "engine exploded" };
      },
    });
    try {
      page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: TEXT });
      await settle();
      // One failure, then the retry path after its 500ms delay; not a loop.
      assert.equal(calls, 1);
    } finally {
      page.close();
    }
  });
});

test("a jump survives the sentence in flight failing (000053)", async () => {
  const TEXT = [
    "The first sentence is here. The second sentence follows it.",
    "The third sentence opens this one. The fourth sentence closes it.",
  ].join("\n\n");
  const pending = [];
  const page = loadPage({
    tts: (msg) =>
      new Promise((resolve) => {
        pending.push({ text: msg.text, resolve });
      }),
  });
  const settle = async () => {
    for (let i = 0; i < 10; i++) await tick();
  };
  try {
    page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: TEXT });
    await settle();
    // Sentence 0 is in flight; jump to paragraph 2 (sentence 2) meanwhile.
    page.click("btn-next");
    await settle();
    pending.shift().resolve({ ok: false, error: "engine exploded" });
    await settle();
    // The target is still asked for, not left waiting behind a stalled loop.
    assert.equal(pending.length, 1);
    assert.match(pending[0].text, /third/);
  } finally {
    page.close();
  }
});

test("the next sentence is preloaded after the player starts this one (000053)", async () => {
  const TEXT = [
    "The first sentence is here. The second sentence follows it.",
    "The third sentence opens this one. The fourth sentence closes it.",
  ].join("\n\n");
  const page = loadPage({
    tts: (msg) => ({ ok: true, engine: "server", data: { audio_base64: `audio:${msg.text}`, timestamps: [] } }),
  });
  const settle = async () => {
    for (let i = 0; i < 20; i++) await tick();
  };
  try {
    page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: TEXT });
    await settle();
    // Everything is made by now, as it is while reading well behind synthesis.
    page.click("btn-next"); // sentence 2, with 3 already made
    await settle();
    // The jump stopped the player, which dropped every preload; sentence 3
    // has to be sent again, and after PLAY 2, or starting 2 would drop it.
    const play2 = page.messages.findIndex((m) => m.type === "PLAY_AUDIO" && m.key === 2);
    const after = page.messages.slice(play2 + 1);
    assert.ok(play2 !== -1, "sentence 2 never played");
    assert.ok(after.some((m) => m.type === "PRELOAD_AUDIO" && m.key === 3), "3 not preloaded after PLAY 2");
  } finally {
    page.close();
  }
});

test("the tab follows the player when it moves on by itself (000059)", async (t) => {
  const TEXT = [
    "The first sentence is here. The second sentence follows it.",
    "The third sentence opens this one. The fourth sentence closes it.",
  ].join("\n\n");
  const settle = async () => {
    for (let i = 0; i < 20; i++) await tick();
  };
  const readyPage = () =>
    loadPage({
      tts: (msg) => ({ ok: true, engine: "server", data: { audio_base64: `audio:${msg.text}`, timestamps: [] } }),
    });
  const start = async (page) => {
    page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: TEXT });
    await settle();
  };
  const plays = (page) => page.messages.filter((m) => m.type === "PLAY_AUDIO").map((m) => m.key);

  await t.test("hands the player every made sentence just ahead, not only the next", async () => {
    const page = readyPage();
    try {
      await start(page);
      const preloaded = page.messages.filter((m) => m.type === "PRELOAD_AUDIO").map((m) => m.key);
      assert.deepEqual([...new Set(preloaded)].sort(), [1, 2, 3]);
    } finally {
      page.close();
    }
  });

  await t.test("sends no PLAY for a sentence the player already started", async () => {
    const page = readyPage();
    try {
      await start(page);
      page.dispatch({ type: "AUDIO_ENDED", key: 0, advancedTo: 1 });
      await settle();
      page.dispatch({ type: "AUDIO_ENDED", key: 1, advancedTo: 2 });
      await settle();
      assert.deepEqual(plays(page), [0]);
      const played = page.logs.filter((l) => l.ev === "chunk.played").map((l) => [l.chunk, l.outcome]);
      assert.deepEqual(played, [[0, "advanced"], [1, "advanced"]]);
      assert.match(page.status(), /\d+%/);
      assert.doesNotMatch(page.status(), /Paragraph/);
    } finally {
      page.close();
    }
  });

  await t.test("asks for the next one itself when the player could not advance", async () => {
    const page = readyPage();
    try {
      await start(page);
      page.dispatch({ type: "AUDIO_ENDED", key: 0 });
      await settle();
      assert.deepEqual(plays(page), [0, 1]);
    } finally {
      page.close();
    }
  });

  await t.test("ignores an end reported for a sentence it has moved away from", async () => {
    const page = readyPage();
    try {
      await start(page);
      page.click("btn-next"); // to sentence 2
      await settle();
      page.dispatch({ type: "AUDIO_ENDED", key: 0 }); // the old one, late
      await settle();
      assert.deepEqual(plays(page), [0, 2]);
    } finally {
      page.close();
    }
  });

  await t.test("paused as the player moved on: stays paused on the new sentence", async () => {
    const page = readyPage();
    try {
      await start(page);
      page.click("btn-play"); // pause
      await settle();
      page.dispatch({ type: "AUDIO_ENDED", key: 0, advancedTo: 1 });
      await settle();
      page.click("btn-play"); // resume
      await settle();
      assert.deepEqual(plays(page), [0], "resume must not start a sentence over");
      assert.ok(page.sent.includes("RESUME_AUDIO"), page.sent.join(" "));
    } finally {
      page.close();
    }
  });
});

test("leaving the page stops the audio (000056)", async (t) => {
  const settle = async () => {
    for (let i = 0; i < 10; i++) await tick();
  };
  const readyPage = () =>
    loadPage({ tts: () => ({ ok: true, engine: "server", data: { audio_base64: "a", timestamps: [] } }) });

  await t.test("a reload or navigation stops reading and the player", async () => {
    const page = readyPage();
    try {
      await startReading(page);
      const before = page.sent.filter((s) => s === "STOP_AUDIO").length;
      page.window.dispatchEvent(new page.window.Event("pagehide"));
      await settle();
      assert.ok(page.sent.filter((s) => s === "STOP_AUDIO").length > before, page.sent.join(" "));
      assert.ok(page.logs.some((l) => l.ev === "page.leave"));
      assert.equal(page.window.document.getElementById("read-aloud-toolbar-host"), null, "the toolbar should be gone");
    } finally {
      page.close();
    }
  });

  await t.test("a jump to a #fragment on the same page does not", async () => {
    const page = readyPage();
    try {
      await startReading(page);
      const before = page.sent.filter((s) => s === "STOP_AUDIO").length;
      page.window.dispatchEvent(new page.window.HashChangeEvent("hashchange"));
      await settle();
      assert.equal(page.sent.filter((s) => s === "STOP_AUDIO").length, before);
      assert.ok(page.window.document.getElementById("read-aloud-toolbar-host"), "the toolbar should still be there");
    } finally {
      page.close();
    }
  });

  await t.test("leaving a page that is not being read sends nothing", async () => {
    const page = readyPage();
    try {
      page.window.dispatchEvent(new page.window.Event("pagehide"));
      await settle();
      assert.deepEqual(page.sent, []);
    } finally {
      page.close();
    }
  });
});

test("reading from the selected text (000039)", async (t) => {
  const BODY = `
    <nav><p>Home, the archive and the other places on this site.</p></nav>
    <p>The first sentence is here. The second sentence follows it.</p>
    <p>The third sentence opens this one. The fourth sentence closes it.</p>
    <form><textarea>A draft that is being typed, not read aloud at all.</textarea></form>`;
  const settle = async (ms = 0) => {
    for (let i = 0; i < 20; i++) await tick();
    if (ms) await new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 20; i++) await tick();
  };
  const open = (settings) =>
    loadPage({
      body: BODY,
      settings,
      tts: (msg) => ({ ok: true, engine: "server", data: { audio_base64: `audio:${msg.text}`, timestamps: [] } }),
    });
  const start = async (page) => {
    page.dispatch({ type: "TOGGLE_READ_ALOUD" });
    await settle();
  };
  // Selects `length` characters starting `offset` into the text of the
  // paragraph containing `needle`, the way a reader's drag would.
  const select = async (page, needle, offset = 0, length = 5) => {
    const doc = page.window.document;
    const host = [...doc.querySelectorAll("p, textarea")].find((el) => el.textContent.includes(needle));
    const node = host.firstChild;
    const at = node.textContent.indexOf(needle) + offset;
    doc.getSelection().setBaseAndExtent(node, at, node, at + length);
    doc.dispatchEvent(new page.window.Event("selectionchange"));
    await settle(400);
  };
  const plays = (page) => page.messages.filter((m) => m.type === "PLAY_AUDIO").map((m) => m.key);

  await t.test("while playing, jumps to the sentence where the selection starts", async () => {
    const page = open();
    try {
      await start(page);
      await select(page, "fourth", 4); // inside "The fourth sentence closes it."
      assert.deepEqual(plays(page), [0, 3]);
      assert.equal(page.logs.find((l) => l.ev === "jump.selection")?.chunk, 3);
    } finally {
      page.close();
    }
  });

  await t.test("while paused, moves there and stays paused until Play", async () => {
    const page = open();
    try {
      await start(page);
      page.click("btn-play"); // pause
      await settle();
      await select(page, "The third");
      assert.deepEqual(plays(page), [0], "a paused reader must stay paused");
      assert.match(page.status(), /paused/);
      page.click("btn-play"); // play
      await settle();
      assert.deepEqual(plays(page), [0, 2]);
    } finally {
      page.close();
    }
  });

  await t.test("leaves a selection outside the read text alone", async () => {
    const page = open();
    try {
      await start(page);
      await select(page, "the archive");
      await select(page, "A draft");
      assert.deepEqual(plays(page), [0]);
    } finally {
      page.close();
    }
  });

  await t.test("does nothing when the setting is off", async () => {
    const page = open({ readFromSelection: false });
    try {
      await start(page);
      await select(page, "fourth");
      assert.deepEqual(plays(page), [0]);
    } finally {
      page.close();
    }
  });

  await t.test("does not jump again while the same selection is extended", async () => {
    const page = open();
    try {
      await start(page);
      await select(page, "The third", 0, 5);
      await select(page, "The third", 0, 20);
      assert.deepEqual(plays(page), [0, 2]);
    } finally {
      page.close();
    }
  });
});

test("the progress bar (000040)", async (t) => {
  // 27 + 31 + 34 + 30 = 122 characters, in two paragraphs.
  const TEXT = [
    "The first sentence is here. The second sentence follows it.",
    "The third sentence opens this one. The fourth sentence closes it.",
  ].join("\n\n");
  const settle = async () => {
    for (let i = 0; i < 20; i++) await tick();
  };
  // Every sentence lasts one second per character, so the page is 122s long.
  const open = (settings) =>
    loadPage({
      settings,
      tts: (msg) => ({
        ok: true,
        engine: "server",
        data: { audio_base64: "a", timestamps: [{ word: "x", start: 0, end: msg.text.length }] },
      }),
    });
  const start = async (page) => {
    page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: TEXT });
    await settle();
  };
  const plays = (page) => page.messages.filter((m) => m.type === "PLAY_AUDIO").map((m) => m.key);

  await t.test("is a slider over the paragraphs", async () => {
    const page = open();
    try {
      await start(page);
      const bar = page.toolbarEl("progress");
      assert.equal(bar.getAttribute("role"), "slider");
      assert.equal(bar.getAttribute("aria-valuemax"), "2");
      assert.equal(bar.getAttribute("aria-valuenow"), "1");
    } finally {
      page.close();
    }
  });

  await t.test("shades what is synthesized", async () => {
    const page = open();
    try {
      await start(page);
      await new Promise((r) => setTimeout(r, 300)); // the shade repaints on a short delay
      assert.match(page.toolbarEl("progress").style.background, /#585b70|rgb\(88, 91, 112\)/);
    } finally {
      page.close();
    }
  });

  await t.test("estimates the time left from measured durations", async () => {
    const page = open();
    try {
      await start(page);
      // 122 characters at 1 a second, none played yet (000061: no paragraph count).
      assert.equal(page.status(), "2 min left · 0%");
      assert.equal(page.toolbarEl("progress").getAttribute("aria-valuetext"), "2 min left · 0%");
    } finally {
      page.close();
    }
  });

  await t.test("shows the percent alone until some audio is measured", async () => {
    const page = loadPage({
      settings: { speed: 1 },
      tts: () => ({ ok: true, engine: "server", data: { audio_base64: "a", timestamps: [] } }),
    });
    try {
      await start(page);
      assert.equal(page.status(), "0%");
    } finally {
      page.close();
    }
  });

  await t.test("dragging previews the time left and percent where it would land", async () => {
    const page = open();
    try {
      await start(page);
      const bar = page.toolbarEl("progress");
      bar.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 4 });
      bar.dispatchEvent(new page.window.MouseEvent("pointerdown", { clientX: 600, bubbles: true }));
      // Paragraph 2 starts at 58 of 122: 64 seconds left, 47% in.
      assert.equal(page.status(), "1 min left · 47%");
    } finally {
      page.close();
    }
  });

  await t.test("divides the estimate by the playback speed", async () => {
    const page = open({ speed: 2 });
    try {
      await start(page);
      assert.equal(page.status(), "1 min left · 0%"); // 122s at 2x
    } finally {
      page.close();
    }
  });

  await t.test("clicking the bar jumps to the nearest paragraph start", async () => {
    const page = open();
    try {
      await start(page);
      const bar = page.toolbarEl("progress");
      bar.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 4 });
      const at = (type, x) => bar.dispatchEvent(new page.window.MouseEvent(type, { clientX: x, bubbles: true }));
      at("pointerdown", 600); // past the middle: paragraph 2 starts at 58/122
      at("pointerup", 600);
      await settle();
      assert.deepEqual(plays(page), [0, 2]);
      assert.equal(page.logs.find((l) => l.ev === "jump.progress")?.paragraph, 1);
    } finally {
      page.close();
    }
  });

  await t.test("arrow keys move a paragraph, End goes to the last", async () => {
    const page = open();
    try {
      await start(page);
      const bar = page.toolbarEl("progress");
      bar.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await settle();
      bar.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      await settle();
      bar.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
      await settle();
      assert.deepEqual(plays(page), [0, 2, 0, 2]);
    } finally {
      page.close();
    }
  });

  await t.test("scrubbing while paused moves there and stays paused", async () => {
    const page = open();
    try {
      await start(page);
      page.click("btn-play"); // pause
      await settle();
      page.toolbarEl("progress").dispatchEvent(
        new page.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
      await settle();
      assert.deepEqual(plays(page), [0]);
      assert.equal(page.status(), "1 min left · 47% — paused");
    } finally {
      page.close();
    }
  });
});

// The engine is sent the spoken form, and the spans it returns are mapped
// back onto the page text before the record keeps them (000063).
test("Roman numerals are sent as numbers and highlighted as written", async () => {
  const answered = [];
  const page = loadPage({
    tts: (msg) => {
      const at = msg.text.indexOf("six");
      const data = {
        audio_base64: "audio",
        timestamps: [
          { word: "GTA", start: 0, end: 0.3, start_char: at - 4, end_char: at - 1 },
          { word: "six", start: 0.3, end: 0.6, start_char: at, end_char: at + 3 },
          { word: "soon", start: 0.6, end: 0.9, start_char: at + 4, end_char: at + 8 },
        ],
      };
      answered.push(data);
      return { ok: true, engine: "server", data };
    },
  });
  try {
    const text = "Waiting for GTA VI soon.";
    page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: text });
    for (let i = 0; i < 5; i++) await tick();
    const request = page.messages.find((m) => m.type === "TTS_REQUEST");
    assert.equal(request.text, "Waiting for GTA six soon.");
    const spans = answered[0].timestamps.map((s) => text.slice(s.start_char, s.end_char));
    assert.deepEqual(spans, ["GTA", "VI", "soon"]);
  } finally {
    page.close();
  }
});

// Without WebGPU and with no server, nothing was ever read: browser speech
// is opt-in (000018). Where Kokoro cannot run at all it reads with the system
// voice instead, and hands back to Kokoro when a server appears (000069).
test("a browser that can't run Kokoro reads with its own voice (000069)", async (t) => {
  const TEXT = "The first sentence is here. The second one follows it.";
  const noWebGPU = {
    ok: false,
    engine: "browser",
    setting: "auto",
    reason: "WebGPU is not available in this browser",
    noKokoro: true,
  };
  const start = async (page) => {
    page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: TEXT });
    for (let i = 0; i < 5; i++) await tick();
  };

  await t.test("reads with the system voice, and says why", async () => {
    const page = loadPage({ health: () => noWebGPU });
    try {
      await start(page);
      assert.deepEqual(page.utterances.map((u) => u.text), ["The first sentence is here."]);
      assert.ok(!page.sent.includes("TTS_REQUEST"));
      assert.equal(page.engineLabel(), "Browser TTS");
    } finally {
      page.close();
    }
  });

  await t.test("still waits when Kokoro may yet come (the engine not built)", async () => {
    const page = loadPage({ health: () => ({ ...noWebGPU, reason: "engine not built", noKokoro: false }) });
    try {
      await start(page);
      assert.equal(page.utterances.length, 0);
      assert.equal(page.engineLabel(), "No engine");
    } finally {
      page.close();
    }
  });

  await t.test("hands over to Kokoro at the next sentence once a server is up", async () => {
    let health = noWebGPU;
    const page = loadPage({ health: () => health });
    try {
      await start(page);
      assert.equal(page.utterances.length, 1);

      health = { ok: true, engine: "server", setting: "auto" };
      await page.poll();
      await tick();
      page.utterances[0].onend();
      for (let i = 0; i < 5; i++) await tick();

      assert.equal(page.utterances.length, 1, "no second system-voice sentence");
      const requests = page.messages.filter((m) => m.type === "TTS_REQUEST").map((m) => m.text);
      assert.ok(requests.includes("The second one follows it."), requests.join(" | "));
    } finally {
      page.close();
    }
  });
});

test("reading moved to another tab (000033)", async (t) => {
  const TEXT = "The first sentence is here. The second sentence follows it.";
  const settle = async () => {
    for (let i = 0; i < 20; i++) await tick();
  };
  const open = () =>
    loadPage({ tts: () => ({ ok: true, engine: "server", data: { audio_base64: "a", timestamps: [] } }) });
  const start = async (page) => {
    page.dispatch({ type: "TOGGLE_READ_ALOUD", selectedText: TEXT });
    await settle();
  };
  const plays = (page) => page.messages.filter((m) => m.type === "PLAY_AUDIO").map((m) => m.key);
  const host = (page) => page.window.document.getElementById("read-aloud-toolbar-host");

  await t.test("claims the player before its first sentence plays", async () => {
    const page = open();
    try {
      await start(page);
      const started = page.sent.indexOf("READING_STARTED");
      assert.ok(started !== -1 && started < page.sent.indexOf("PLAY_AUDIO"), page.sent.join(" "));
    } finally {
      page.close();
    }
  });

  await t.test("stops, and says why instead of claiming to play", async () => {
    const page = open();
    try {
      await start(page);
      page.dispatch({ type: "READING_MOVED" });
      await settle();
      assert.match(page.status(), /^Reading moved to another tab/);
      assert.ok(host(page), "the toolbar stays to say so");
      // jsdom does not apply the shadow root's styles, so check the class and
      // the rule it switches on: everything but the reason and Close hidden.
      assert.ok(page.toolbarEl("btn-play").closest(".toolbar").classList.contains("moved"));
      const rule = page.toolbarEl("btn-play").getRootNode().querySelector("style").textContent;
      const hidden = rule.match(/([^}]*)\{\s*display:\s*none;\s*\}/)[1];
      for (const part of ["#btn-play", "#btn-prev", "#btn-next", "#btn-stop", ".engine", ".progress", ".speed-group"]) {
        assert.ok(hidden.includes(`.toolbar.moved ${part}`), `${part} is hidden`);
      }
      assert.ok(!hidden.includes("btn-close"));
      assert.ok(page.logs.some((l) => l.ev === "read.moved"));
    } finally {
      page.close();
    }
  });

  await t.test("plays nothing more, even if a late event arrives", async () => {
    const page = open();
    try {
      await start(page);
      page.dispatch({ type: "READING_MOVED" });
      await settle();
      page.dispatch({ type: "AUDIO_ENDED", key: 0 });
      await page.poll();
      await settle();
      assert.deepEqual(plays(page), [0]);
    } finally {
      page.close();
    }
  });

  await t.test("Close removes the notice", async () => {
    const page = open();
    try {
      await start(page);
      page.dispatch({ type: "READING_MOVED" });
      await settle();
      page.click("btn-close");
      assert.equal(host(page), null);
    } finally {
      page.close();
    }
  });

  await t.test("reading here again replaces the notice with a working toolbar", async () => {
    const page = open();
    try {
      await start(page);
      page.dispatch({ type: "READING_MOVED" });
      await settle();
      await start(page);
      assert.equal(page.window.document.querySelectorAll("#read-aloud-toolbar-host").length, 1);
      assert.ok(!page.toolbarEl("btn-play").closest(".toolbar").classList.contains("moved"));
      assert.deepEqual(plays(page), [0, 0]);
    } finally {
      page.close();
    }
  });

  await t.test("a tab that is not reading ignores it", async () => {
    const page = open();
    try {
      page.dispatch({ type: "READING_MOVED" });
      await settle();
      assert.equal(host(page), null);
    } finally {
      page.close();
    }
  });
});
