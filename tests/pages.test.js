// What the extractor reads from real pages (000058), saved under
// tests/fixtures/pages. Each test names text a listener should hear and page
// furniture they should not, and checks that every paragraph can be found in
// the text index, which is what highlighting needs.
//
// A site that reads badly becomes a fixture here and a fix in textkit.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const kit = require("../extension/lib/textkit.js");

const PAGES = path.join(__dirname, "fixtures", "pages");

function read(name, options = { skipCitations: true }) {
  const html = fs.readFileSync(path.join(PAGES, `${name}.html`), "utf8");
  const doc = new JSDOM(html).window.document;
  const paragraphs = kit.extractParagraphs(doc, options);
  const index = kit.buildTextIndex(doc.body, options);
  return { paragraphs, index, all: paragraphs.join("\n") };
}

// Every sentence, in reading order, found where the reader expects it: the
// way content.js walks them, searching forward from the last one found.
function assertAllFound({ paragraphs, index }) {
  const { chunks } = kit.buildChunks(paragraphs);
  let from = 0;
  for (const chunk of chunks) {
    const at = kit.findChunkOffset(index.text, chunk.text, from);
    assert.notEqual(at, -1, `not in the index: ${chunk.text.slice(0, 80)}`);
    from = at;
  }
}

const has = (page, text) => assert.ok(page.all.includes(text), `missing: ${text}`);
const lacks = (page, text) => assert.ok(!page.all.includes(text), `should not be read: ${text}`);

test("Hacker News: every comment, none of the furniture", async (t) => {
  const page = read("hackernews");

  await t.test("reads a comment's first paragraph, written as bare text", () => {
    assert.equal(page.paragraphs[0], "The opening paragraph of the first comment sits directly in the comment div.");
  });

  await t.test("keeps a comment's paragraphs in order", () => {
    assert.deepEqual(page.paragraphs.slice(0, 3), [
      "The opening paragraph of the first comment sits directly in the comment div.",
      "Its second paragraph is in a p element, as every later one is on this site.",
      "And a third, to show that the order is kept from top to bottom.",
    ]);
  });

  await t.test("reads short replies under a header made of links", () => {
    has(page, "Short replies count too?");
    has(page, "Agreed.");
  });

  await t.test("reads a quoted line however short, and speaks it without the mark (000062)", () => {
    assert.ok(page.paragraphs.includes("> the order is kept"));
    // A reply that is only a quote and a link: the link is furniture, the
    // quote is the whole of what was said.
    assert.ok(page.paragraphs.includes("> a quote alone"));
    lacks(page, "algolia");
    const { chunks } = kit.buildChunks(["> a quote alone"]);
    assert.deepEqual(chunks.map((c) => c.text), ["a quote alone"]);
  });

  await t.test("skips headers, timestamps, reply links, the comment box and the footer", () => {
    for (const text of ["Hacker News", "hours ago", "minutes ago", "reply", "parent", "[–]", "add comment", "Guidelines", "Search:", "login"]) {
      lacks(page, text);
    }
  });

  await t.test("skips a code listing but reads the prose around it", () => {
    has(page, "Here is how I ran it on my own machine:");
    has(page, "It was fast enough to read along with, which surprised me.");
    lacks(page, "uvicorn");
  });

  await t.test("every sentence is found in the page", () => assertAllFound(page));
});

test("Wikipedia: the article, its title and its sections", async (t) => {
  const page = read("wikipedia");

  await t.test("starts with the title, in a header inside <main>", () => {
    assert.equal(page.paragraphs[0], "Speech synthesis");
  });

  await t.test("reads the lead paragraph", () => {
    has(page, "Speech synthesis is the artificial production of human speech.");
  });

  await t.test("reads section headings, however short", () => {
    assert.ok(page.paragraphs.includes("History"), page.paragraphs.slice(0, 20).join(" | "));
  });

  await t.test("skips the menus, the contents list and the [edit] links", () => {
    for (const text of ["Jump to content", "Main page", "Toggle the table of contents", "[edit]", "Edit links"]) {
      lacks(page, text);
    }
  });

  await t.test("skips citation markers unless asked to read them", () => {
    assert.ok(!/\[\d+\]/.test(page.all), (page.all.match(/.{30}\[\d+\].{10}/) || [""])[0]);
    const withMarkers = read("wikipedia", { skipCitations: false });
    assert.ok(/\[\d+\]/.test(withMarkers.all));
    assertAllFound(withMarkers);
  });

  await t.test("every sentence is found in the page", () => assertAllFound(page));
});

test("MDN: the docs page without its site around it", async (t) => {
  const page = read("mdn");

  await t.test("starts with the title, then the introduction", () => {
    assert.equal(page.paragraphs[0], "Web Speech API");
    assert.match(page.paragraphs[1], /^The Web Speech API enables you to incorporate voice data/);
  });

  await t.test("reads the interface descriptions", () => {
    has(page, "Represents a voice that the system supports.");
  });

  await t.test("skips the navigation, sidebar and site footer", () => {
    for (const text of ["Skip to main content", "In this article", "Mozilla careers", "Your blueprint for a better internet"]) {
      lacks(page, text);
    }
  });

  await t.test("every sentence is found in the page", () => assertAllFound(page));
});

test("The Go blog: a post, with its code left out", async (t) => {
  const page = read("goblog");

  await t.test("reads the title and the post", () => {
    assert.equal(page.paragraphs[0], "Go 1.22 is released!");
    has(page, "Today the Go team is thrilled to release Go 1.22");
  });

  await t.test("skips code listings", () => {
    lacks(page, "func main()");
    lacks(page, "fmt.Println");
  });

  await t.test("skips the site navigation", () => {
    for (const text of ["Why Go", "Get Started", "Playground"]) lacks(page, text);
  });

  await t.test("every sentence is found in the page", () => assertAllFound(page));
});

test("Wikinews: a news article", async (t) => {
  const page = read("wikinews");

  await t.test("reads the story", () => {
    has(page, "In early January, international media reported that Quinten Delaere");
    has(page, "Technical investigation");
  });

  await t.test("skips the menus", () => {
    for (const text of ["Jump to content", "Main page", "Random article"]) lacks(page, text);
  });

  await t.test("every sentence is found in the page", () => assertAllFound(page));
});
