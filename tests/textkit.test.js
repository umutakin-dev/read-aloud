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

// ─── paragraphsFromRoot ─────────────────────────────────────────────────────
test("paragraphsFromRoot", async (t) => {
  await t.test("takes one paragraph per block element", () => {
    const body = bodyOf(`
      <h1>A heading long enough to survive the filter</h1>
      <p>The first paragraph, which is comfortably past the minimum length.</p>
      <p>The second paragraph, also long enough to be worth reading aloud.</p>
    `);
    assert.equal(kit.paragraphsFromRoot(body).length, 3);
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
    const paragraphs = kit.paragraphsFromRoot(body);
    assert.equal(paragraphs.length, 2);
    assert.ok(!paragraphs.some((p) => p.includes("first half") && p.includes("second half")));
  });

  await t.test("does not emit a list item and its paragraph twice", () => {
    const body = bodyOf(`<li><p>A list item wrapping a paragraph of real text.</p></li>`);
    assert.equal(kit.paragraphsFromRoot(body).length, 1);
  });

  await t.test("keeps inline markup inside one paragraph", () => {
    const body = bodyOf(
      `<p>Body text with <em>emphasis</em> and a <a href="#">link</a> inside it.</p>`
    );
    const paragraphs = kit.paragraphsFromRoot(body);
    assert.equal(paragraphs.length, 1);
    assert.equal(paragraphs[0], "Body text with emphasis and a link inside it.");
  });

  await t.test("drops blocks too short to be worth reading", () => {
    const body = bodyOf(`<p>short</p><p>A paragraph that is long enough to keep.</p>`);
    assert.deepEqual(kit.paragraphsFromRoot(body), [
      "A paragraph that is long enough to keep.",
    ]);
  });

  await t.test("collapses whitespace so the text index can match it", () => {
    const body = bodyOf(`<p>  Text   with\n\n  irregular\twhitespace throughout.  </p>`);
    assert.deepEqual(kit.paragraphsFromRoot(body), [
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
    for (const paragraph of kit.paragraphsFromRoot(body)) {
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
