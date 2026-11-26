// Covers extension/lib/textkit.js — paragraph extraction, chunking, the text
// index and word spans. Nearly every defect found during the code review lived
// in here, so each block below names the failure it is guarding against.
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const kit = require("../extension/lib/textkit.js");

function bodyOf(html) {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document.body;
}

// What the extension reads from a page made of this body (000058).
const paragraphsOf = (body, options) => kit.extractParagraphs(body.ownerDocument, options);

// ─── extractParagraphs ──────────────────────────────────────────────────────
test("extractParagraphs", async (t) => {
  await t.test("takes one paragraph per block element", () => {
    const body = bodyOf(`
      <h1>A heading long enough to survive the filter</h1>
      <p>The first paragraph, which is comfortably past the minimum length.</p>
      <p>The second paragraph, also long enough to be worth reading aloud.</p>
    `);
    assert.equal(paragraphsOf(body).length, 3);
  });

  await t.test("does not emit a wrapper alongside the blocks inside it", () => {
    // Hacker News nests comment bodies in table cells; taking both the td and
    // its paragraphs read every comment twice.
    const body = bodyOf(`
      <td><div>
        <p>The first half of a comment, long enough to count on its own.</p>
        <p>The second half of that same comment, also long enough to count.</p>
      </div></td>
    `);
    const paragraphs = paragraphsOf(body);
    assert.equal(paragraphs.length, 2);
    assert.ok(!paragraphs.some((p) => p.includes("first half") && p.includes("second half")));
  });

  await t.test("does not emit a list item and its paragraph twice", () => {
    const body = bodyOf(`<li><p>A list item wrapping a paragraph of real text.</p></li>`);
    assert.equal(paragraphsOf(body).length, 1);
  });

  await t.test("keeps inline markup inside one paragraph", () => {
    const body = bodyOf(
      `<p>Body text with <em>emphasis</em> and a <a href="#">link</a> inside it.</p>`
    );
    const paragraphs = paragraphsOf(body);
    assert.equal(paragraphs.length, 1);
    assert.equal(paragraphs[0], "Body text with emphasis and a link inside it.");
  });

  await t.test("drops blocks too short to be worth reading", () => {
    const body = bodyOf(`<p>short</p><p>A paragraph that is long enough to keep.</p>`);
    assert.deepEqual(paragraphsOf(body), [
      "A paragraph that is long enough to keep.",
    ]);
  });

  await t.test("collapses whitespace so the text index can match it", () => {
    const body = bodyOf(`<p>  Text   with\n\n  irregular\twhitespace throughout.  </p>`);
    assert.deepEqual(paragraphsOf(body), [
      "Text with irregular whitespace throughout.",
    ]);
  });
});

// ─── splitIntoParagraphs ────────────────────────────────────────────────────
test("splitIntoParagraphs", async (t) => {
  await t.test("splits on blank lines", () => {
    const text = "The first paragraph of the text.\n\nThe second paragraph of the text.";
    assert.equal(kit.splitIntoParagraphs(text).length, 2);
  });

  await t.test("falls back to single newlines when blank lines yield one piece", () => {
    const text = "The first paragraph of the text.\nThe second paragraph of the text.";
    assert.equal(kit.splitIntoParagraphs(text).length, 2);
  });

  await t.test("drops pieces below the minimum length", () => {
    const text = "ok\n\nA paragraph that is long enough to be kept by the filter.";
    assert.equal(kit.splitIntoParagraphs(text).length, 1);
  });
});

// ─── splitAroundUrls ────────────────────────────────────────────────────────
test("splitAroundUrls", async (t) => {
  // Kokoro spells a URL out character by character — 16 seconds of audio for a
  // 153-character line that was mostly a link.
  const cases = [
    ["a bare url yields nothing to read", "https://www.theguardian.com/books/2003/nov/28/fiction.film", 0],
    ["a www-form url yields nothing", "www.example.com/some/very/long/path", 0],
    [
      "text either side of a url is kept",
      "As you'll see on goodreads https://www.goodreads.com/en/book/show/60500189 the reaction is bimodal.",
      2,
    ],
    [
      "a url after a leading word",
      "From https://www.theguardian.com/books/2000/sep/03/biography (link posted elsewhere).",
      2,
    ],
    [
      "two urls in one paragraph",
      "See https://one.example.com/a and also https://two.example.com/b for background.",
      3,
    ],
    ["a paragraph with no url is left whole", "An ordinary paragraph with no links.", 1],
    ["a scheme mentioned but not a link", "The https:// prefix marks a secure page.", 1],
  ];

  for (const [name, input, expected] of cases) {
    await t.test(name, () => {
      const pieces = kit.splitAroundUrls(input);
      assert.equal(pieces.length, expected);
      for (const piece of pieces) {
        assert.ok(
          !/https?:\/\/\S{6}|www\.\S+\.\S+/i.test(piece),
          `url survived in ${JSON.stringify(piece)}`
        );
        // The invariant highlighting depends on: a chunk must remain findable
        // in the page text with indexOf.
        assert.ok(input.includes(piece), `${JSON.stringify(piece)} is not a run of the input`);
      }
    });
  }

  await t.test("punctuation stranded beside a url is not synthesized alone", () => {
    assert.deepEqual(kit.splitAroundUrls("(https://example.com/x)"), []);
  });
});

// ─── buildChunks ────────────────────────────────────────────────────────────
test("buildChunks", async (t) => {
  const sentence = "This is a sentence of some length that goes on for a while. ";
  const short = "A short paragraph that is longer than twenty characters.";
  const long = sentence.repeat(20).trim();
  const paragraphs = [short, long, short, long];
  const { chunks, paragraphStarts } = kit.buildChunks(paragraphs);

  await t.test("keeps one start per paragraph", () => {
    assert.equal(paragraphStarts.length, paragraphs.length);
    assert.equal(paragraphStarts[0], 0);
  });

  await t.test("splits long paragraphs into several chunks", () => {
    assert.ok(chunks.length > paragraphStarts.length);
  });

  await t.test("keeps every chunk within the size cap", () => {
    for (const chunk of chunks) {
      assert.ok(chunk.text.length <= kit.MAX_CHUNK_CHARS, `${chunk.text.length} chars`);
    }
  });

  await t.test("labels each chunk with the paragraph containing it", () => {
    chunks.forEach((chunk, i) => {
      let expected = 0;
      paragraphStarts.forEach((start, p) => {
        if (i >= start) expected = p;
      });
      assert.equal(chunk.paragraph, expected);
    });
  });

  await t.test("starts are strictly increasing", () => {
    for (let i = 1; i < paragraphStarts.length; i++) {
      assert.ok(paragraphStarts[i] > paragraphStarts[i - 1]);
    }
  });

  await t.test("a paragraph's chunks rejoin to its text", () => {
    paragraphStarts.forEach((start, p) => {
      const end = p + 1 < paragraphStarts.length ? paragraphStarts[p + 1] : chunks.length;
      const rejoined = chunks
        .slice(start, end)
        .map((c) => c.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      assert.equal(rejoined, paragraphs[p].replace(/\s+/g, " ").trim());
    });
  });

  await t.test("a paragraph that is only a url contributes nothing", () => {
    const built = kit.buildChunks(["https://example.com/only-a-link-here-and-nothing-else"]);
    assert.deepEqual(built.chunks, []);
    assert.deepEqual(built.paragraphStarts, []);
  });
});

// ─── prev/next navigation ───────────────────────────────────────────────────
// The toolbar reported synthesis chunks as paragraphs — "Paragraph 1/366" on an
// article with far fewer. These reproduce the toolbar's arithmetic.
test("paragraph navigation", async (t) => {
  const sentence = "This is a sentence of some length that goes on for a while. ";
  const paragraphs = [
    "A short paragraph that is longer than twenty characters.",
    sentence.repeat(20).trim(),
    "Another short paragraph, also past the minimum length.",
    sentence.repeat(20).trim(),
  ];
  const { chunks, paragraphStarts } = kit.buildChunks(paragraphs);

  const paragraphOf = (chunk) => chunks[chunk].paragraph;
  const next = (chunk) => {
    const target = paragraphOf(chunk) + 1;
    return target < paragraphStarts.length ? paragraphStarts[target] : chunk;
  };
  const prev = (chunk) => {
    const here = paragraphOf(chunk);
    const target = chunk === paragraphStarts[here] ? here - 1 : here;
    return target >= 0 ? paragraphStarts[target] : chunk;
  };

  await t.test("next moves one whole paragraph", () => {
    assert.equal(paragraphOf(next(0)), 1);
  });

  await t.test("next from mid-paragraph skips the rest of it", () => {
    assert.equal(paragraphOf(next(paragraphStarts[1] + 1)), 2);
  });

  await t.test("prev from mid-paragraph restarts that paragraph", () => {
    assert.equal(prev(paragraphStarts[1] + 1), paragraphStarts[1]);
  });

  await t.test("prev at a paragraph start goes back one", () => {
    assert.equal(paragraphOf(prev(paragraphStarts[1])), 0);
  });

  await t.test("prev at the very start stays put", () => {
    assert.equal(prev(0), 0);
  });

  await t.test("next at the last paragraph stays put", () => {
    const last = paragraphStarts[paragraphStarts.length - 1];
    assert.equal(next(last), last);
  });

  await t.test("walking next visits every paragraph exactly once", () => {
    const visited = [];
    let cursor = 0;
    for (let i = 0; i < 50; i++) {
      visited.push(paragraphOf(cursor));
      const advanced = next(cursor);
      if (advanced === cursor) break;
      cursor = advanced;
    }
    assert.deepEqual(visited, [0, 1, 2, 3]);
  });
});

// ─── buildTextIndex ─────────────────────────────────────────────────────────
// Highlighting silently did nothing on most pages: chunk text had its
// whitespace collapsed while the page text did not, so the exact match failed.
test("buildTextIndex", async (t) => {
  const cases = [
    ["a single text node", `Hello world`],
    ["text split across inline elements", `The <em>quick</em> brown fox`],
    ["a whitespace-only node between elements", `<span>foo</span> <span>bar</span>`],
    ["newline-formatted markup", `\n  Hello there,\n  <b>friend</b>.\n`],
    ["leading and trailing whitespace", `   padded   `],
    ["runs of spaces and tabs", `a  \t\n  b`],
    ["a non-breaking space", `a b`],
    ["nested inline elements", `<p>An <em>emphasised <b>bold</b></em> phrase.</p>`],
  ];

  for (const [name, html] of cases) {
    await t.test(`collapses ${name} the same way chunk text is collapsed`, () => {
      const body = bodyOf(html);
      const index = kit.buildTextIndex(body);
      assert.equal(index.text, body.textContent.replace(/\s+/g, " ").trim());
    });
  }

  await t.test("does not splice words across a whitespace-only node", () => {
    // The bug this guards: rejecting whitespace-only nodes produced "foobar".
    const index = kit.buildTextIndex(bodyOf(`<span>foo</span> <span>bar</span>`));
    assert.equal(index.text, "foo bar");
  });

  await t.test("maps every character back to its source node", () => {
    const index = kit.buildTextIndex(bodyOf(`The <em>quick</em> brown fox`));
    assert.equal(index.nodes.length, index.text.length);
    assert.equal(index.offsets.length, index.text.length);
    for (let i = 0; i < index.text.length; i++) {
      if (index.text[i] === " ") continue; // collapsed spaces anchor to the next char
      assert.equal(index.nodes[i].textContent[index.offsets[i]], index.text[i]);
    }
  });

  await t.test("excludes script and style content", () => {
    const index = kit.buildTextIndex(
      bodyOf(`<p>Visible text.</p><script>var hidden = 1;</script><style>.a{}</style>`)
    );
    assert.equal(index.text, "Visible text.");
  });

  await t.test("a chunk can be located in the index it was built beside", () => {
    const html = `<p>The first paragraph here.</p><p>The second paragraph here.</p>`;
    const body = bodyOf(html);
    const index = kit.buildTextIndex(body);
    for (const paragraph of paragraphsOf(body)) {
      assert.ok(index.text.includes(paragraph), `${JSON.stringify(paragraph)} not in index`);
    }
  });
});

// ─── locating a chunk in the page ───────────────────────────────────────────
// Searching from position zero found the *first* copy of a repeated phrase, so
// the highlight landed on the wrong one and dragged the viewport with it.
test("findChunkOffset", async (t) => {
  // A quoted comment: the same sentence appears twice on the page.
  const page =
    "I think it is workman like. " + // 0
    "Someone replies: I think it is workman like. And I disagree.";
  const chunk = "I think it is workman like.";
  const second = page.indexOf(chunk, 1);

  await t.test("finds the first occurrence with no hint", () => {
    assert.equal(kit.findChunkOffset(page, chunk), 0);
  });

  await t.test("finds the occurrence being read, given a hint", () => {
    assert.equal(kit.findChunkOffset(page, chunk, 5), second);
  });

  await t.test("does not go backwards past the hint when it need not", () => {
    assert.ok(kit.findChunkOffset(page, chunk, 5) > 5);
  });

  await t.test("falls back to the whole page when nothing lies ahead", () => {
    // A stale hint, or a page that changed under us. Highlighting the wrong
    // copy still beats not highlighting.
    assert.equal(kit.findChunkOffset(page, chunk, page.length - 5), 0);
  });

  await t.test("reports a miss when the text is not there at all", () => {
    assert.equal(kit.findChunkOffset(page, "not present anywhere", 0), -1);
    assert.equal(kit.findChunkOffset(page, "not present anywhere", 10), -1);
  });

  await t.test("walking a document of repeated phrases visits each in turn", () => {
    const line = "The same line again. ";
    const document = line.repeat(5);
    const found = [];
    let from = 0;
    for (let i = 0; i < 5; i++) {
      const at = kit.findChunkOffset(document, line.trim(), from);
      found.push(at);
      from = at + line.length;
    }
    assert.deepEqual(found, [0, 21, 42, 63, 84]);
  });
});

test("searchStartFor", async (t) => {
  await t.test("starts at the beginning when nothing is resolved yet", () => {
    assert.equal(kit.searchStartFor({}, 0), 0);
  });

  await t.test("starts from the chunk immediately before", () => {
    assert.equal(kit.searchStartFor({ 0: 100, 1: 250, 2: 400 }, 3), 400);
  });

  await t.test("ignores chunks after the one being resolved", () => {
    // Jumping backwards: chunk 5 is known, but resolving chunk 2 must not
    // start from past it, or the search would run off the end.
    assert.equal(kit.searchStartFor({ 0: 100, 1: 250, 5: 900 }, 2), 250);
  });

  await t.test("starts at the beginning when jumping before everything known", () => {
    assert.equal(kit.searchStartFor({ 3: 400, 4: 550 }, 0), 0);
  });

  await t.test("takes the nearest, not the largest offset", () => {
    // Offsets are not necessarily ordered by index if a rebuild intervened.
    assert.equal(kit.searchStartFor({ 0: 900, 1: 100 }, 2), 100);
  });
});

// ─── resolveWordSpans ───────────────────────────────────────────────────────
// Offsets were re-derived by assuming one space between every token, which
// drifts as soon as Kokoro emits punctuation as its own token.
test("resolveWordSpans", async (t) => {
  await t.test("uses the server's spans when it aligned the word", () => {
    const text = "The quick brown fox.";
    const spans = kit.resolveWordSpans([
      { word: "The", start_char: 0, end_char: 3 },
      { word: "quick", start_char: 4, end_char: 9 },
      { word: "brown", start_char: 10, end_char: 15 },
      { word: "fox", start_char: 16, end_char: 19 },
    ]);
    for (const span of spans) {
      assert.equal(text.slice(span._start, span._end), span.word);
    }
  });

  await t.test("an unaligned word does not shift the ones after it", () => {
    // "1990" comes back as "nineteen" "ninety", which cannot be found in the
    // text. The next aligned word must snap back to the truth.
    const text = "In 1990 the world changed";
    const spans = kit.resolveWordSpans([
      { word: "In", start_char: 0, end_char: 2 },
      { word: "nineteen" },
      { word: "ninety" },
      { word: "the", start_char: 8, end_char: 11 },
      { word: "world", start_char: 12, end_char: 17 },
      { word: "changed", start_char: 18, end_char: 25 },
    ]);
    for (const span of spans) {
      if (span.start_char == null) continue;
      assert.equal(text.slice(span._start, span._end), span.word);
    }
  });

  await t.test("estimates from the previous word when nothing is aligned", () => {
    const spans = kit.resolveWordSpans([{ word: "one" }, { word: "two" }]);
    assert.deepEqual(
      spans.map((s) => [s._start, s._end]),
      [
        [0, 3],
        [4, 7],
      ]
    );
  });

  await t.test("handles an empty list", () => {
    assert.deepEqual(kit.resolveWordSpans([]), []);
  });
});

// ─── Citation markers (000047) ──────────────────────────────────────────────
// Wikipedia's "[7]" was read aloud as "seven", mid-sentence. The marker has to
// go from the paragraph text AND from the text index, or the chunk stops being
// an exact run of the page text and its highlighting is lost.
test("citation markers", async (t) => {
  const WIKI =
    '<p>Individuals weighted new information ("cold cognition").' +
    '<sup class="reference"><a href="#cite_note-7"><span>[</span>7<span>]</span></a></sup>' +
    ' More recent theories were motivational<sup><a href="#cite_note-2">[2]</a></sup> or affective.' +
    '<sup><i><a href="/wiki/Citation_needed">[citation needed]</a></i></sup></p>';
  const SPOKEN =
    'Individuals weighted new information ("cold cognition"). More recent theories were motivational or affective.';

  await t.test("are skipped from paragraph text when asked", () => {
    assert.deepEqual(paragraphsOf(bodyOf(WIKI), { skipCitations: true }), [SPOKEN]);
  });

  await t.test("are kept by default", () => {
    const [text] = paragraphsOf(bodyOf(WIKI));
    assert.match(text, /\[7\]/);
  });

  await t.test("the skipped paragraph is still found in the skipped index", () => {
    const body = bodyOf(WIKI);
    const [paragraph] = paragraphsOf(body, { skipCitations: true });
    const index = kit.buildTextIndex(body, { skipCitations: true });
    assert.notEqual(index.text.indexOf(paragraph), -1, index.text);
  });

  await t.test("a footnote superscript that links into the page is a marker", () => {
    const body = bodyOf('<p>As shown before<sup><a href="#fn1">1</a></sup>, it holds.</p>');
    assert.ok(kit.isCitationMarker(body.querySelector("sup")));
  });

  await t.test("an exponent is not", () => {
    const body = bodyOf("<p>E = mc<sup>2</sup> and x<sup>n+1</sup></p>");
    for (const sup of body.querySelectorAll("sup")) assert.ok(!kit.isCitationMarker(sup));
  });

  await t.test("a superscript linking off the page is not", () => {
    const body = bodyOf('<p>Trademark<sup><a href="https://example.com">TM</a></sup></p>');
    assert.ok(!kit.isCitationMarker(body.querySelector("sup")));
  });
});

// ─── Sentences (000053) ────────────────────────────────────────────────────
test("splitIntoSentences", async (t) => {
  const cases = [
    ["ends at . ! and ?", "One here. Two here! Three here? Four.", ["One here.", "Two here!", "Three here?", "Four."]],
    ["keeps text with no final stop", "First one. And then", ["First one.", "And then"]],
    ["does not end after a title", "Mr. Smith met Dr. Jones.", ["Mr. Smith met Dr. Jones."]],
    ["does not end after an initial", "J. K. Rowling wrote it. Then more.", ["J. K. Rowling wrote it.", "Then more."]],
    ["does not end after an acronym with stops", "The U.S. Army said so. Next.", ["The U.S. Army said so.", "Next."]],
    ["does not end inside a number", "It rose 3.5 percent. Then fell.", ["It rose 3.5 percent.", "Then fell."]],
    ["does not end before a lower-case word", "Use e.g. this one. Done.", ["Use e.g. this one.", "Done."]],
    ["keeps a closing quote with its sentence", 'He said "Stop." Then he left.', ['He said "Stop."', "Then he left."]],
    ["ends before an opening quote", 'It was late. "Go home," she said.', ["It was late.", '"Go home," she said.']],
    ["ends before a number", "Chapter one ends. 2024 was the year.", ["Chapter one ends.", "2024 was the year."]],
  ];
  for (const [name, text, expected] of cases) {
    await t.test(name, () => assert.deepEqual(kit.splitIntoSentences(text), expected));
  }
});

test("splitParagraphIntoChunks gives one sentence per chunk", async (t) => {
  await t.test("each sentence of a short paragraph is its own chunk", () => {
    assert.deepEqual(kit.splitParagraphIntoChunks("A first sentence here. A second one."), [
      "A first sentence here.",
      "A second one.",
    ]);
  });

  await t.test("a sentence past the cap is cut at a clause, within the cap", () => {
    const clause = "a clause that runs on for quite a while, ";
    const sentence = `Start ${clause.repeat(20)}and the end.`;
    const chunks = kit.splitParagraphIntoChunks(sentence);
    assert.ok(chunks.length > 1);
    for (const c of chunks) assert.ok(c.length <= kit.MAX_CHUNK_CHARS, `${c.length} chars`);
    assert.ok(chunks[0].endsWith(","), chunks[0].slice(-20));
    assert.equal(chunks.join(" "), sentence);
  });

  await t.test("a sentence with no clause or space past the cap is still cut", () => {
    const chunks = kit.splitParagraphIntoChunks("x".repeat(kit.MAX_CHUNK_CHARS + 10));
    assert.deepEqual(chunks.map((c) => c.length), [kit.MAX_CHUNK_CHARS, 10]);
  });

  await t.test("does not split before a dash or an ellipsis, which start no sentence", () => {
    assert.deepEqual(kit.splitParagraphIntoChunks("Before it. (…) After it."), ["Before it. (…) After it."]);
    assert.deepEqual(kit.splitParagraphIntoChunks("Before it. — After it."), ["Before it. — After it."]);
  });

  await t.test("every chunk is an exact run of the paragraph, so it can be highlighted", () => {
    const paragraph =
      'Mr. Smith said "No." Then, at 3.5 km, he stopped! Why? See https://example.com/x for more. The end';
    for (const c of kit.splitParagraphIntoChunks(paragraph)) {
      assert.ok(paragraph.includes(c), c);
    }
  });
});

// ─── What is not read (000058) ─────────────────────────────────────────────
test("extractParagraphs skips page furniture by what the markup says", async (t) => {
  const BODY = "A paragraph of the article, long enough to be read aloud.";
  const only = (html) => paragraphsOf(bodyOf(`${html}<p>${BODY}</p>`));

  const cases = [
    ["a nav", `<nav><p>Home, About, and all the other places to go.</p></nav>`],
    ["an aside", `<aside><p>A sidebar with related reading in it, long enough.</p></aside>`],
    ["a form and its labels", `<form><label>Your name, please, in full if you can.</label><textarea>draft</textarea></form>`],
    ["a button", `<p><button>Subscribe to the newsletter today.</button></p>`],
    ["role=navigation", `<div role="navigation"><p>Previous article and the next article too.</p></div>`],
    ["role=banner", `<div role="banner"><p>The site's banner with its long tagline here.</p></div>`],
    ["the hidden attribute", `<p hidden>Text the page keeps but never shows to anyone.</p>`],
    ["aria-hidden", `<p aria-hidden="true">Text hidden from assistive technology entirely.</p>`],
    ["display:none", `<p style="display: none">A collapsed section's long text, not shown.</p>`],
    ["a site header", `<header><p>The site's name and its long tagline go here.</p></header>`],
    ["a data table", `<table><tr><th>Year</th><th>Event</th></tr><tr><td>1779</td><td>Kratzenstein's vowel machine won a prize.</td></tr></table>`],
    ["a code listing", `<pre><code>for (const word of sentence.split(" ")) speak(word);</code></pre>`],
    ["a menu of links", `<ul><li><a href="/a">The first section of the site</a></li><li><a href="/b">The second section of the site</a></li></ul>`],
  ];
  for (const [name, html] of cases) {
    await t.test(`skips ${name}`, () => assert.deepEqual(only(html), [BODY]));
  }

  await t.test("reads a layout table, as on Hacker News", () => {
    const html = `<table><tr><td>A comment laid out in a table cell, long enough to read.</td></tr></table>`;
    assert.deepEqual(only(html), ["A comment laid out in a table cell, long enough to read.", BODY]);
  });

  await t.test("reads an article's own header, which holds its title", () => {
    const body = bodyOf(`<article><header><h1>Title</h1></header><p>${BODY}</p></article>`);
    assert.deepEqual(paragraphsOf(body), ["Title", BODY]);
  });

  await t.test("reads a paragraph with a link in it, as long as it is mostly prose", () => {
    const text = "Read the full report on the agency's site before deciding.";
    const html = `<p>Read the full <a href="/r">report</a> on the agency's site before deciding.</p>`;
    assert.deepEqual(only(html), [text, BODY]);
  });

  await t.test("drops [edit] beside a heading, but not a citation when asked to read them", () => {
    const body = bodyOf(
      `<h2>History<span class="mw-editsection"><span>[</span><a href="/e">edit</a><span>]</span></span></h2>` +
        `<p>${BODY}<sup><a href="#c1">[1]</a></sup></p>`
    );
    assert.deepEqual(paragraphsOf(body, { skipCitations: false }), ["History", `${BODY}[1]`]);
  });

  await t.test("goes into <main> when the page marks one", () => {
    const body = bodyOf(`<div><p>Promotional text outside the main region, long enough.</p></div><main><p>${BODY}</p></main>`);
    assert.deepEqual(paragraphsOf(body), [BODY]);
  });
});

// ─── From a point on the page to the index (000039) ─────────────────────────
test("positionInIndex", async (t) => {
  const body = bodyOf(
    `<p>First para here.</p>\n  <p>Second <b>bold</b> para.</p><script>var x = 1;</script><p>Third.</p>`
  );
  const index = kit.buildTextIndex(body);
  const [p1, p2, , p3] = body.children;
  const text = (i) => index.text.slice(i, i + 6);

  await t.test("a point inside a text node lands on that character", () => {
    assert.equal(text(kit.positionInIndex(index, p1.firstChild, 6)), "para h");
  });

  await t.test("the start of a paragraph lands on its first letter, not the space before it", () => {
    assert.equal(text(kit.positionInIndex(index, p2.firstChild, 0)), "Second");
  });

  await t.test("a point between elements moves forward to the next text", () => {
    assert.equal(text(kit.positionInIndex(index, p2, 1)), "bold p");
  });

  await t.test("a point in text the index skips moves forward past it", () => {
    const script = body.querySelector("script");
    assert.equal(text(kit.positionInIndex(index, script.firstChild, 2)), "Third.");
  });

  await t.test("nothing after the point gives -1", () => {
    assert.equal(kit.positionInIndex(index, p3.firstChild, 6), -1);
  });

  await t.test("every character maps back to itself", () => {
    for (let i = 0; i < index.text.length; i++) {
      if (index.text[i] === " ") continue;
      assert.equal(kit.positionInIndex(index, index.nodes[i], index.offsets[i]), i);
    }
  });
});

// Kokoro spelled "GTA VI" as letters (000063). The engine is sent a spoken
// form, and its word spans are mapped back so the page's "VI" lights up.
test("spokenForm reads Roman numerals as numbers", async (t) => {
  const spoken = (text) => kit.spokenForm(text).text;

  await t.test("two or more letters after a capitalised word", () => {
    assert.equal(spoken("Now with the launch of GTA VI you may lose"), "Now with the launch of GTA six you may lose");
    assert.equal(spoken("After World War II ended."), "After World War two ended.");
    assert.equal(spoken("Rocky IV, then Chapter XXXIX."), "Rocky four, then Chapter thirty-nine.");
    assert.equal(spoken("Henry VIII"), "Henry eight");
  });

  await t.test("a lone V or X only after an all-caps name", () => {
    assert.equal(spoken("still making millions from GTA V."), "still making millions from GTA five.");
    assert.equal(spoken("replace GTA V online"), "replace GTA five online");
    assert.equal(spoken("Mac OS X"), "Mac OS ten");
    assert.equal(spoken("Malcolm X spoke"), "Malcolm X spoke");
    assert.equal(spoken("Plan V"), "Plan V");
  });

  await t.test("leaves everything else alone", () => {
    for (const text of [
      "I think I said so.",       // the pronoun
      "Then I went home.",        // after a capital, still the pronoun
      "Buy the CD and MIX it",    // not made of I, V and X alone
      "GTA-V and GTA VIs",        // joined to something
      "Mr. V",                    // punctuation between
    ]) {
      assert.equal(spoken(text), text);
    }
  });

  // espeak-ng, behind the browser engine, read "an IV drip" as "an roman
  // four drip" (000066). A run kept as letters is sent spelled out.
  await t.test("a run kept as letters is sent hyphenated, so it is spelled", () => {
    assert.equal(spoken("The nurse started an IV drip."), "The nurse started an I-V drip.");
    assert.equal(spoken("VI is an editor"), "V-I is an editor");
    assert.equal(spoken("Section IIII"), "Section I-I-I-I");
    assert.equal(spoken("Malcolm X spoke"), "Malcolm X spoke");
  });

  await t.test("a spelled run is highlighted as written", () => {
    const page = "an IV drip";
    const { text, edits } = kit.spokenForm(page);
    const spans = kit.spansToPage(
      [
        { word: "an", start_char: 0, end_char: 2 },
        { word: "I-V", start_char: text.indexOf("I-V"), end_char: text.indexOf("I-V") + 3 },
        { word: "drip", start_char: text.indexOf("drip"), end_char: text.indexOf("drip") + 4 },
      ],
      edits
    );
    assert.deepEqual(spans.map((s) => page.slice(s.start_char, s.end_char)), ["an", "IV", "drip"]);
  });

  await t.test("no edits when nothing changes", () => {
    assert.deepEqual(kit.spokenForm("Plain text.").edits, []);
  });
});

test("spansToPage maps spoken offsets back onto the page text", async (t) => {
  // Spans as the server returns them, counted into the spoken text.
  const spansOf = (spokenText, words) => {
    let from = 0;
    return words.map((word) => {
      const at = spokenText.indexOf(word, from);
      from = at + word.length;
      return { word, start_char: at, end_char: at + word.length };
    });
  };

  await t.test("a replaced word covers the numeral, and later words shift back", () => {
    const page = "From GTA V to GTA VI soon.";
    const { text, edits } = kit.spokenForm(page);
    assert.equal(text, "From GTA five to GTA six soon.");
    const spans = kit.spansToPage(spansOf(text, ["From", "GTA", "five", "to", "GTA", "six", "soon", "."]), edits);
    assert.deepEqual(
      spans.map((s) => page.slice(s.start_char, s.end_char)),
      ["From", "GTA", "V", "to", "GTA", "VI", "soon", "."]
    );
  });

  await t.test("a span over part of a replaced word still covers the numeral", () => {
    const page = "Part XXI ends";
    const { text, edits } = kit.spokenForm(page);
    assert.equal(text, "Part twenty-one ends");
    // A tokenizer may split "twenty-one" into "twenty", "-" and "one".
    const spans = kit.spansToPage(spansOf(text, ["twenty", "-", "one", "ends"]), edits);
    assert.deepEqual(spans.map((s) => page.slice(s.start_char, s.end_char)), ["XXI", "XXI", "XXI", "ends"]);
  });

  await t.test("a word without a span is left for resolveWordSpans", () => {
    const { edits } = kit.spokenForm("GTA VI");
    const spans = kit.spansToPage([{ word: "six", start_char: null, end_char: null }], edits);
    assert.equal(spans[0].start_char, null);
  });
});

// Kokoro read "$3.8B" as "three point eight B" (000064).
test("spokenForm reads amounts with a unit letter as words", async (t) => {
  const spoken = (text) => kit.spokenForm(text).text;

  await t.test("the amounts on the page that found it", () => {
    assert.equal(spoken("They've made ~825M last 12 month"), "They've made about 825 million last 12 month");
    assert.equal(spoken("announced $3.8B in gross sales"), "announced 3.8 billion dollars in gross sales");
    assert.equal(spoken("(about 32.5M units)."), "(about 32.5 million units).");
    assert.equal(spoken("made ~$2.5B in revenue"), "made about 2.5 billion dollars in revenue");
  });

  await t.test("other currencies, units and spellings", () => {
    assert.equal(spoken("£5m a year"), "5 million pounds a year");
    assert.equal(spoken("€1.2bn deal"), "1.2 billion euros deal");
    assert.equal(spoken("a $50K salary"), "a 50 thousand dollars salary");
    assert.equal(spoken("$1.1T market"), "1.1 trillion dollars market");
    assert.equal(spoken("1,200M users"), "1,200 million users");
    assert.equal(spoken("70B parameters"), "70 billion parameters");
    assert.equal(spoken("$5M/year"), "5 million dollars/year");
  });

  await t.test("leaves everything else alone", () => {
    for (const text of [
      "a 4K screen",          // K needs a currency sign
      "a 3T magnet",          // so does T
      "ran 100m",             // lowercase m without one is metres
      "costs $825 now",       // no unit: the engine says dollars itself
      "code 0x1B",            // part of a hex number
      "about ~ half",         // a tilde before no number
      "path~2",               // a tilde inside a word
    ]) {
      assert.equal(spoken(text), text);
    }
  });

  await t.test("a highlighted word lands on the amount it came from", () => {
    const page = "made ~$2.5B in revenue";
    const { text, edits } = kit.spokenForm(page);
    const words = ["made", "about", "2.5", "billion", "dollars", "in", "revenue"];
    let from = 0;
    const spans = words.map((word) => {
      const at = text.indexOf(word, from);
      from = at + word.length;
      return { word, start_char: at, end_char: at + word.length };
    });
    kit.spansToPage(spans, edits);
    assert.deepEqual(
      spans.map((s) => page.slice(s.start_char, s.end_char)),
      ["made", "~", "$2.5B", "$2.5B", "$2.5B", "in", "revenue"]
    );
  });
});

// Both engines spelled "a 5MB file" as "a 5 M-B file" (000067).
test("spokenForm reads data sizes and rates as words", async (t) => {
  const spoken = (text) => kit.spokenForm(text).text;

  await t.test("a size describing something stays singular, a quantity is plural", () => {
    assert.equal(spoken("a 5MB file"), "a 5 megabyte file");
    assert.equal(spoken("a 2TB disk and an 8GiB stick"), "a 2 terabyte disk and an 8 gibibyte stick");
    assert.equal(spoken("16GB of RAM"), "16 gigabytes of ram");
    assert.equal(spoken("it is 5 MB"), "it is 5 megabytes");
    assert.equal(spoken("only 1GB left"), "only 1 gigabyte left");
    assert.equal(spoken("500KB and 3kB"), "500 kilobytes and 3 kilobytes");
  });

  await t.test("rates are per second, in bits or bytes as written", () => {
    assert.equal(spoken("a 100Mbps link"), "a 100 megabits per second link");
    assert.equal(spoken("10Gb/s over fibre"), "10 gigabits per second over fibre");
    assert.equal(spoken("copies at 50 MB/s"), "copies at 50 megabytes per second");
  });

  await t.test("leaves everything else alone", () => {
    for (const text of [
      "a 5Mb file",      // bare Mb: megabits or megabytes, nobody agrees
      "5MBs",            // the unit runs into more letters
      "a 3GHz chip",     // the engines say GHz themselves
      "the MB was fine", // no number
    ]) {
      assert.equal(spoken(text), text);
    }
  });

  await t.test("the digits keep their own highlight", () => {
    const page = "a 5MB file";
    const { text, edits } = kit.spokenForm(page);
    const words = ["a", "5", "megabyte", "file"];
    let from = 0;
    const spans = words.map((word) => {
      const at = text.indexOf(word, from);
      from = at + word.length;
      return { word, start_char: at, end_char: at + word.length };
    });
    kit.spansToPage(spans, edits);
    assert.deepEqual(spans.map((s) => page.slice(s.start_char, s.end_char)), ["a", "5", "MB", "file"]);
  });
});

// espeak-ng, behind the browser engine, spelled "RAM" as "R-A-M" (000068).
test("spokenForm sends acronyms said as words in lowercase", async (t) => {
  const spoken = (text) => kit.spokenForm(text).text;

  await t.test("the listed ones", () => {
    assert.equal(spoken("16 gigabytes of RAM and a LAN party"), "16 gigabytes of ram and a lan party");
    assert.equal(spoken("Enter your PIN, then the ROM loads."), "Enter your pin, then the rom loads.");
  });

  await t.test("leaves the rest as written", () => {
    for (const text of [
      "the GPU and the CD",  // spelled, rightly
      "NASA and ASCII",      // espeak already says these
      "RAMs and ROM-based",  // joined to more
      "Ram and ram",         // not capitals
    ]) {
      assert.equal(spoken(text), text);
    }
  });

  await t.test("the list is generated, sorted and all capitals", () => {
    const source = require("node:fs").readFileSync(require.resolve("../extension/lib/textkit.js"), "utf8");
    const block = source.slice(source.indexOf("BEGIN GENERATED"), source.indexOf("END GENERATED"));
    const words = block.slice(block.indexOf("`") + 1, block.lastIndexOf("`")).trim().split(/\s+/);
    assert.ok(words.includes("RAM"));
    assert.deepEqual(words, [...words].sort());
    assert.ok(words.every((w) => /^[A-Z]{2,6}$/.test(w)));
  });
});
