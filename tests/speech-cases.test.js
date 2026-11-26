// tests/manual/speech-cases.html is the page for hearing what the reader says
// (000065). Each case's data-expect is shown to the listener as what they
// should hear, so it has to be true: this runs the page through the real
// extraction, chunking and spoken form, the way content.js does, and finds
// every expectation in what would be sent to the engine, in page order.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const kit = require("../extension/lib/textkit.js");

const PAGE = path.join(__dirname, "manual", "speech-cases.html");

test("the speech cases page says what it promises", async (t) => {
  const doc = new JSDOM(fs.readFileSync(PAGE, "utf8")).window.document;
  const paragraphs = kit.extractParagraphs(doc);
  const { chunks } = kit.buildChunks(paragraphs);
  const heard = chunks.map((chunk) => kit.spokenForm(chunk.text).text).join(" ");
  const cases = [...doc.querySelectorAll("[data-expect]")];

  await t.test("has cases", () => assert.ok(cases.length >= 20, `only ${cases.length}`));

  await t.test("every case is heard as its data-expect says, in page order", () => {
    let from = 0;
    for (const element of cases) {
      const expected = element.getAttribute("data-expect");
      const at = heard.indexOf(expected, from);
      assert.notEqual(at, -1, `not heard: "${expected}"\nheard from there: "${heard.slice(from, from + 160)}"`);
      from = at + expected.length;
    }
  });

  await t.test("reads neither the instructions nor the bare link", () => {
    for (const text of ["How to use", "http.server", "algolia", "hear:"]) {
      assert.ok(!heard.includes(text), `should not be read: ${text}`);
    }
  });

  await t.test("every sentence is found in the page, for highlighting", () => {
    const index = kit.buildTextIndex(doc.body);
    let from = 0;
    for (const chunk of chunks) {
      const at = kit.findChunkOffset(index.text, chunk.text, from);
      assert.notEqual(at, -1, `not in the index: ${chunk.text}`);
      from = at;
    }
  });
});
