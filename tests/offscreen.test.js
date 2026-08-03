// Covers extension/offscreen.js — the audio player. Loads the real file under
// stubbed browser audio and drives its message handler.
//
// What matters here is the preload handshake: a chunk boundary used to spend
// two 1.8MB structured clones and a fresh decode, all of which could have
// happened while the previous chunk was still playing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "extension", "offscreen.js"),
  "utf8"
);

function load() {
  const events = [];
  let listener = null;
  let liveUrls = 0;

  class FakeAudio {
    constructor(url) {
      this.src = url;
      this.paused = true;
      this.currentTime = 0;
      this.duration = 30;
      this.readyState = 0;
      events.push(`construct:${url}`);
    }
    load() {
      this.readyState = 1;
      events.push(`load:${this.src}`);
    }
    play() {
      this.paused = false;
      events.push(`play:${this.src}`);
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    addEventListener(type, fn) {
      if (type === "loadedmetadata") fn();
    }
  }

  const sandbox = {
    console,
    atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
    Uint8Array,
    Blob: class {
      constructor(parts, opts) {
        this.parts = parts;
        this.type = opts?.type;
      }
    },
    URL: {
      createObjectURL: (blob) => `blob:${++liveUrls}-${blob.parts[0].length}`,
      revokeObjectURL: () => {
        liveUrls--;
      },
    },
    Audio: FakeAudio,
    setInterval: () => 1,
    clearInterval: () => {},
    chrome: {
      runtime: {
        sendMessage: (m) => events.push(`emit:${m.type}`),
        onMessage: { addListener: (fn) => (listener = fn) },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: "offscreen.js" });

  const send = (msg) =>
    new Promise((resolve) => {
      const returned = listener({ target: "offscreen", ...msg }, null, resolve);
      if (returned !== true) resolve(undefined);
    });

  return { send, events, liveUrls: () => liveUrls };
}

const AUDIO_A = Buffer.from("chunk-a-audio-bytes").toString("base64");
const AUDIO_B = Buffer.from("chunk-b-audio-bytes-longer").toString("base64");

test("preloading the next chunk", async (t) => {
  await t.test("decodes and loads it before it is needed", async () => {
    const { send, events } = load();
    await send({ type: "PLAY", key: 0, audio_base64: AUDIO_A, speed: 1 });
    await send({ type: "PRELOAD", key: 1, audio_base64: AUDIO_B });
    assert.ok(events.some((e) => e.startsWith("load:")), events.join(" "));
  });

  await t.test("plays by key alone, decoding nothing at the boundary", async () => {
    const { send, events } = load();
    await send({ type: "PLAY", key: 0, audio_base64: AUDIO_A, speed: 1 });
    await send({ type: "PRELOAD", key: 1, audio_base64: AUDIO_B });

    const before = events.length;
    const response = await send({ type: "PLAY", key: 1, speed: 1 });

    assert.equal(response.ok, true);
    assert.equal(response.usedPreload, true);
    assert.ok(
      !events.slice(before).some((e) => e.startsWith("construct:")),
      events.slice(before).join(" ")
    );
  });

  await t.test("asks for the audio when nothing is preloaded", async () => {
    const { send } = load();
    const response = await send({ type: "PLAY", key: 7, speed: 1 });
    assert.equal(response.needAudio, true);
  });

  await t.test("plays normally once the audio is resent", async () => {
    const { send } = load();
    await send({ type: "PLAY", key: 7, speed: 1 });
    const retry = await send({ type: "PLAY", key: 7, audio_base64: AUDIO_A, speed: 1 });
    assert.equal(retry.ok, true);
    assert.equal(retry.usedPreload, false);
  });

  await t.test("does not play a preload belonging to another chunk", async () => {
    const { send } = load();
    await send({ type: "PRELOAD", key: 5, audio_base64: AUDIO_B });
    const response = await send({ type: "PLAY", key: 9, speed: 1 });
    assert.equal(response.needAudio, true);
  });
});

test("object URL lifetime", async (t) => {
  await t.test("does not accumulate across chunks", async () => {
    const { send, liveUrls } = load();
    await send({ type: "PLAY", key: 0, audio_base64: AUDIO_A, speed: 1 });
    for (let i = 1; i <= 5; i++) {
      await send({ type: "PRELOAD", key: i, audio_base64: AUDIO_B });
      await send({ type: "PLAY", key: i, speed: 1 });
    }
    assert.ok(liveUrls() <= 2, `${liveUrls()} live`);
  });

  await t.test("replacing a preload releases the one it displaces", async () => {
    const { send, liveUrls } = load();
    await send({ type: "PRELOAD", key: 1, audio_base64: AUDIO_B });
    await send({ type: "PRELOAD", key: 2, audio_base64: AUDIO_B });
    await send({ type: "PRELOAD", key: 3, audio_base64: AUDIO_B });
    assert.equal(liveUrls(), 1);
  });

  await t.test("stop releases both the playing and the preloaded audio", async () => {
    const { send, liveUrls } = load();
    await send({ type: "PLAY", key: 0, audio_base64: AUDIO_A, speed: 1 });
    await send({ type: "PRELOAD", key: 1, audio_base64: AUDIO_B });
    await send({ type: "STOP" });
    assert.equal(liveUrls(), 0);
  });
});

test("resume", async (t) => {
  await t.test("reports nothing to resume when there is no audio", async () => {
    const { send } = load();
    const response = await send({ type: "RESUME" });
    assert.equal(response.resumed, false);
  });

  await t.test("resumes audio that is still loaded", async () => {
    const { send } = load();
    await send({ type: "PLAY", key: 0, audio_base64: AUDIO_A, speed: 1 });
    const response = await send({ type: "RESUME" });
    assert.equal(response.resumed, true);
  });

  await t.test("replays from a saved position after the document was rebuilt", async () => {
    const { send } = load();
    const response = await send({
      type: "PLAY",
      key: 3,
      audio_base64: AUDIO_A,
      speed: 1.5,
      startAt: 12.5,
    });
    assert.equal(response.ok, true);
  });
});
