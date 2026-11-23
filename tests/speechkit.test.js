// Covers engine/speechkit.mjs — turning the browser engine's per-sentence
// Kokoro output into the server's response shape (000046).
//
// The contract that matters: content.js highlights by start/end times and by
// start_char/end_char into the request text, and it cannot tell which engine
// produced them. A span that is off by one highlights the wrong letters; a
// timestamp past the audio's end leaves the last word unlit.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () =>
  import(pathToFileURL(path.join(__dirname, "..", "engine", "speechkit.mjs")).href);

const RATE = 24000;
const seconds = (s) => new Float32Array(Math.round(s * RATE)).fill(0.1);

test("estimateWordTimestamps", async (t) => {
  const kit = await load();

  await t.test("spans every word's characters exactly", () => {
    const sentence = "The quick fox.";
    const words = kit.estimateWordTimestamps(sentence, null, 0, 1, 10);
    assert.deepEqual(
      words.map((w) => [w.word, w.start_char, w.end_char]),
      [
        ["The", 10, 13],
        ["quick", 14, 19],
        ["fox.", 20, 24],
      ]
    );
  });

  await t.test("fills the sentence's duration exactly, with no gaps", () => {
    const words = kit.estimateWordTimestamps("one two three", null, 2, 3, 0);
    assert.equal(words[0].start, 2);
    assert.ok(Math.abs(words.at(-1).end - 5) < 1e-9, words.at(-1).end);
    for (let i = 1; i < words.length; i++) assert.equal(words[i].start, words[i - 1].end);
  });

  await t.test("weights by phonemes when the groups line up with the words", () => {
    // "a" is one sound and "strengths" many; by characters they would be 1:9
    // either way, so use a pair where phonemes disagree with spelling.
    const words = kit.estimateWordTimestamps("though it", "ðˈoʊ ɪt", 0, 1, 0);
    // "though" is 6 letters but 3 sounds; "it" is 2 and 2. Phonemes: 3:2.
    const share = (w) => w.end - w.start;
    assert.ok(Math.abs(share(words[0]) / share(words[1]) - 3 / 2) < 1e-9);
  });

  await t.test("falls back to characters when the groups do not line up", () => {
    // Kokoro expands 1990 into two groups: 2 words vs 3 groups.
    const words = kit.estimateWordTimestamps("In 1990", "ɪn nˈaɪntiːn nˈaɪndi", 0, 1, 0);
    const share = (w) => w.end - w.start;
    assert.ok(Math.abs(share(words[0]) / share(words[1]) - 2 / 4) < 1e-9);
  });

  await t.test("stress marks and punctuation carry no weight", () => {
    assert.equal(kit.phonemeWeight("ˈaɪ,"), 2);
    assert.equal(kit.phonemeWeight("iː"), 2); // the length mark is a real sound
  });

  await t.test("an unlocated sentence gives words with no character span", () => {
    const words = kit.estimateWordTimestamps("hello there", null, 0, 1, null);
    assert.ok(words.every((w) => w.start_char === null && w.end_char === null));
  });

  await t.test("an empty sentence gives nothing", () => {
    assert.deepEqual(kit.estimateWordTimestamps("   ", null, 0, 1, 0), []);
  });
});

test("locateSentences", async (t) => {
  const kit = await load();

  await t.test("finds each sentence in order", () => {
    const text = "First one. Second one. Third.";
    assert.deepEqual(kit.locateSentences(text, ["First one.", "Second one.", "Third."]), [0, 11, 23]);
  });

  await t.test("maps a repeated sentence to the occurrence being read", () => {
    const text = "Yes. No. Yes.";
    assert.deepEqual(kit.locateSentences(text, ["Yes.", "No.", "Yes."]), [0, 5, 9]);
  });

  await t.test("tolerates the splitter trimming and collapsing whitespace", () => {
    const text = "One  sentence here. Two.";
    const located = kit.locateSentences(text, ["One  sentence here.", "Two."]);
    assert.deepEqual(located, [0, 20]);
  });

  await t.test("a sentence that is not in the text is null, and the rest still map", () => {
    const text = "Alpha. Beta.";
    assert.deepEqual(kit.locateSentences(text, ["Alpha.", "Gamma.", "Beta."]), [0, null, 7]);
  });
});

test("encodeWav", async (t) => {
  const kit = await load();

  await t.test("writes a 16-bit mono PCM header for the sample rate", () => {
    const bytes = kit.encodeWav(new Float32Array(10), RATE);
    const view = new DataView(bytes.buffer);
    const ascii = (at) => String.fromCharCode(...bytes.slice(at, at + 4));
    assert.equal(ascii(0), "RIFF");
    assert.equal(ascii(8), "WAVE");
    assert.equal(view.getUint16(22, true), 1); // mono
    assert.equal(view.getUint32(24, true), RATE);
    assert.equal(view.getUint16(34, true), 16);
    assert.equal(view.getUint32(40, true), 20); // 10 samples × 2 bytes
    assert.equal(bytes.length, 44 + 20);
  });

  await t.test("clips rather than wrapping samples outside [-1, 1]", () => {
    const bytes = kit.encodeWav(new Float32Array([2, -2]), RATE);
    const view = new DataView(bytes.buffer);
    assert.equal(view.getInt16(44, true), 0x7fff);
    assert.equal(view.getInt16(46, true), -0x8000);
  });
});

test("assembleResponse", async (t) => {
  const kit = await load();
  const text = "Hello there. How are you?";
  const response = kit.assembleResponse(
    text,
    [
      { text: "Hello there.", phonemes: null, samples: seconds(1) },
      { text: "How are you?", phonemes: null, samples: seconds(2) },
    ],
    RATE
  );

  await t.test("has the server's response shape", () => {
    assert.equal(typeof response.audio_base64, "string");
    assert.equal(response.sample_rate, RATE);
    for (const ts of response.timestamps) {
      assert.deepEqual(Object.keys(ts).sort(), ["end", "end_char", "start", "start_char", "word"]);
    }
  });

  await t.test("the second sentence starts where the first one's audio ends", () => {
    const how = response.timestamps.find((w) => w.word === "How");
    assert.ok(Math.abs(how.start - 1) < 1e-9, how.start);
    assert.ok(Math.abs(response.timestamps.at(-1).end - 3) < 1e-9);
  });

  await t.test("every span points at its own word in the request text", () => {
    for (const ts of response.timestamps) {
      assert.equal(text.slice(ts.start_char, ts.end_char), ts.word);
    }
  });

  await t.test("the audio is both sentences back to back", () => {
    const bytes = Buffer.from(response.audio_base64, "base64");
    assert.equal(bytes.length, 44 + 3 * RATE * 2);
  });
});
