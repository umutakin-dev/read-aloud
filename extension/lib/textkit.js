// Turning a document into readable chunks, and mapping those chunks back to the
// DOM so a word can be highlighted where it appears.
//
// Kept separate from content.js because this is where the subtle bugs live —
// whitespace collapsing that has to match on both sides, chunk-to-paragraph
// indices, URL handling that must not break the exact-substring property
// highlighting depends on. content.js is extension plumbing; this is testable
// logic, and it is tested in tests/textkit.test.js.
//
// Loaded as a plain script in the extension (defining a global) and as a module
// in Node. No imports either way.
const ReadAloudText = (() => {
  "use strict";

  // ─── Paragraphs ───────────────────────────────────────────────────────────
  // Paragraphs come from block elements rather than from newlines in flattened
  // text. Whether flattened text carries a newline where a paragraph ended is a
  // property of the source markup, not of the document — on Hacker News it
  // carries almost none, and a whole comment thread collapsed into two
  // "paragraphs". The structure is in the DOM; flattening first throws it away.
  const BLOCK_SELECTOR =
    "p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, dd, figcaption, td";

  const MIN_PARAGRAPH_CHARS = 20;

  // ─── Citation markers ─────────────────────────────────────────────────────
  // Wikipedia's "[7]" and "[citation needed]", and a blog's footnote "¹" link,
  // are spoken mid-sentence as "seven" and break it in two (000047). They are
  // recognised by shape, not class names: Readability strips classes, and the
  // live page and its Readability copy have to agree on every node dropped.
  //
  // Dropping one is safe for highlighting only because it is dropped on both
  // sides — from the paragraph text here and from the text index below — so
  // a chunk is still an exact run of the indexed page text.
  const BRACKETED = /^\[[^[\]]{1,40}\]$/;
  const MAX_FOOTNOTE_LABEL = 4;

  function isCitationMarker(element) {
    if (element.tagName !== "SUP") return false;
    const text = element.textContent.replace(/\s+/g, " ").trim();
    if (!text) return false;
    if (BRACKETED.test(text)) return true;
    // An unbracketed footnote is a short superscript made only of links into
    // the page itself. A bare "2" with no link is an exponent and is read.
    const links = element.querySelectorAll("a");
    return (
      links.length > 0 &&
      text.length <= MAX_FOOTNOTE_LABEL &&
      [...links].every((a) => (a.getAttribute("href") || "").startsWith("#"))
    );
  }

  function insideCitationMarker(element) {
    for (let el = element; el; el = el.parentElement) {
      if (el.tagName === "SUP" && isCitationMarker(el)) return true;
    }
    return false;
  }

  function blockText(block, skipCitations) {
    let source = block;
    if (skipCitations && block.querySelector("sup")) {
      source = block.cloneNode(true);
      for (const sup of source.querySelectorAll("sup")) {
        if (isCitationMarker(sup)) sup.remove();
      }
    }
    return source.textContent.replace(/\s+/g, " ").trim();
  }

  function paragraphsFromRoot(root, { skipCitations = false } = {}) {
    const paragraphs = [];
    for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
      // A block containing another block is a wrapper — its text belongs to the
      // children, and taking both would read it twice.
      if (block.querySelector(BLOCK_SELECTOR)) continue;
      const text = blockText(block, skipCitations);
      if (text.length <= MIN_PARAGRAPH_CHARS) continue;
      paragraphs.push(text);
    }
    return paragraphs;
  }

  // Last resort, for plain text with no structure to read (a selection, or a
  // document whose blocks all got filtered out).
  function splitIntoParagraphs(text) {
    // First try double newlines
    let paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > MIN_PARAGRAPH_CHARS);

    // If too few paragraphs, try single newlines
    if (paragraphs.length <= 1) {
      paragraphs = text
        .split(/\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter((p) => p.length > MIN_PARAGRAPH_CHARS);
    }

    return paragraphs;
  }

  // ─── Chunks ───────────────────────────────────────────────────────────────
  // A chunk is one sentence (000053): the unit that is synthesized, kept and
  // played. Reading starts as soon as the first sentence is ready instead of a
  // whole 500-character run, and a sentence already heard replays from the
  // page's record without synthesis. The reader still navigates paragraphs.
  // A sentence longer than the cap is cut at a clause, so no request is huge.
  const MAX_CHUNK_CHARS = 500;

  // Kokoro spells a URL out one character at a time: 16 seconds of audio for a
  // 153-character line that was mostly a Guardian link. Rewriting the text to
  // drop it is not an option — the chunk has to stay matchable against the page
  // for findParagraphOffset — but splitting *around* it is, because each
  // remaining fragment is still an exact run of the page text.
  const URL_IN_TEXT = /\bhttps?:\/\/\S+|\bwww\.\S+\.\S+/gi;

  function splitAroundUrls(text) {
    const pieces = [];
    let cursor = 0;

    const keep = (piece) => {
      const trimmed = piece.trim();
      // Whatever is left either side of a link can be punctuation on its own —
      // a stray "(" is not worth a synthesis round trip.
      if (trimmed && /[a-z0-9]/i.test(trimmed)) pieces.push(trimmed);
    };

    for (const match of text.matchAll(URL_IN_TEXT)) {
      keep(text.slice(cursor, match.index));
      cursor = match.index + match[0].length;
    }
    keep(text.slice(cursor));

    return pieces;
  }

  // ─── Sentences ────────────────────────────────────────────────────────────
  // Our own rules rather than Intl.Segmenter, which ends a sentence after
  // "Mr." and "U.S." and need not agree between Chrome and Firefox. A sentence
  // ends at . ! or ?, with any closing quotes or brackets, followed by
  // whitespace and something that can start one: a capital, a digit, or an
  // opening quote or bracket. "3.5" and "e.g. this" never qualify.
  const SENTENCE_BREAK = /([.!?]+["'”’)\]]*)\s+(?=["'“‘(\[]?[A-Z0-9])/g;

  // Words whose period does not end a sentence even before a capital.
  const ABBREVIATIONS = new Set(
    (
      "mr mrs ms dr prof sr jr st mt ft rev gen col lt sgt capt cmdr gov sen rep " +
      "pres hon vs etc no nos vol fig figs approx dept est inc ltd co corp jan feb " +
      "mar apr jun jul aug sep sept oct nov dec e.g i.e cf al ca op"
    ).split(" ")
  );

  function endsWithAbbreviation(text) {
    const word = (text.match(/(\S+)\.$/) || [])[1];
    if (!word) return false;
    // An initial ("J.") or an acronym written with stops ("U.S.", "a.m.").
    if (/^(?:[A-Za-z]\.)*[A-Za-z]$/.test(word)) return true;
    return ABBREVIATIONS.has(word.toLowerCase().replace(/^[("'“‘\[]+/, ""));
  }

  function splitIntoSentences(text) {
    const sentences = [];
    let start = 0;
    for (const match of text.matchAll(SENTENCE_BREAK)) {
      const end = match.index + match[1].length;
      const candidate = text.slice(start, end);
      if (match[1].startsWith(".") && endsWithAbbreviation(candidate)) continue;
      sentences.push(candidate.trim());
      start = end;
    }
    const rest = text.slice(start).trim();
    if (rest) sentences.push(rest);
    return sentences.filter(Boolean);
  }

  // A sentence past the cap is cut at the last clause boundary that fits, or
  // the last space, so every piece stays an exact run of the page text.
  function capLength(sentence) {
    const pieces = [];
    let rest = sentence;
    while (rest.length > MAX_CHUNK_CHARS) {
      const window = rest.slice(0, MAX_CHUNK_CHARS + 1);
      let cut = Math.max(window.lastIndexOf("; "), window.lastIndexOf(", "));
      if (cut > MAX_CHUNK_CHARS / 3) cut += 1;
      else cut = window.lastIndexOf(" ");
      if (cut <= 0) cut = MAX_CHUNK_CHARS;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
    return pieces;
  }

  function splitParagraphIntoChunks(paragraph) {
    const chunks = [];
    for (const piece of splitAroundUrls(paragraph)) {
      for (const sentence of splitIntoSentences(piece)) {
        // A lone "(1)" or "—" left between sentences is not worth a request.
        if (!/[a-z0-9]/i.test(sentence)) continue;
        chunks.push(...capLength(sentence));
      }
    }
    return chunks;
  }

  // Playback and prefetch both want a flat sequence they can walk with a single
  // index, so chunks stay flat and each one just remembers which paragraph it
  // came from. paragraphStarts is what prev/next jump between.
  function buildChunks(paragraphs) {
    const chunks = [];
    const paragraphStarts = [];

    for (const paragraph of paragraphs) {
      const pieces = splitParagraphIntoChunks(paragraph);
      if (!pieces.length) continue;
      paragraphStarts.push(chunks.length);
      const paragraphIndex = paragraphStarts.length - 1;
      for (const text of pieces) {
        chunks.push({ text, paragraph: paragraphIndex });
      }
    }

    return { chunks, paragraphStarts };
  }

  // ─── Text index ───────────────────────────────────────────────────────────
  // Chunk text has its whitespace collapsed, so the page text has to be
  // collapsed identically or the chunk is never found. We build that collapsed
  // string alongside a per-character map back into the DOM, which is what lets a
  // character span become a Range.
  const WHITESPACE = /\s/;

  function isRenderedText(node) {
    const parent = node.parentElement;
    if (!parent) return false;
    const tag = parent.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return false;
    // Hidden text is in the DOM but not in what Readability extracted, so
    // including it would shift every offset after it.
    if (typeof parent.checkVisibility === "function") {
      return parent.checkVisibility({ visibilityProperty: true });
    }
    return true;
  }

  function buildTextIndex(root, { skipCitations = false } = {}) {
    const doc = root.ownerDocument || root;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode(node) {
        // Whitespace-only nodes are kept, not rejected: the space between
        // `<span>foo</span> <span>bar</span>` lives in one, and dropping it
        // would splice the two words into "foobar".
        if (!isRenderedText(node)) return 2 /* REJECT */;
        // Mirrors blockText(), or chunks would no longer match the page.
        if (skipCitations && insideCitationMarker(node.parentElement)) return 2;
        return 1 /* ACCEPT */;
      },
    });

    let text = "";
    const nodes = []; // nodes[i] + offsets[i] locate text[i] in the DOM
    const offsets = [];
    let pendingSpace = false;
    let node;

    while ((node = walker.nextNode())) {
      const raw = node.textContent;
      for (let i = 0; i < raw.length; i++) {
        if (WHITESPACE.test(raw[i])) {
          // Defer it — a run of whitespace collapses to at most one space, and
          // leading whitespace is dropped entirely.
          pendingSpace = text.length > 0;
          continue;
        }
        if (pendingSpace) {
          text += " ";
          nodes.push(node);
          offsets.push(i);
          pendingSpace = false;
        }
        text += raw[i];
        nodes.push(node);
        offsets.push(i);
      }
    }

    return { text, nodes, offsets };
  }

  // ─── Locating a chunk in the page ─────────────────────────────────────────
  // Chunks are read in document order, so the occurrence being spoken is always
  // at or after the previous one. Searching from the start of the document
  // instead finds the *first* copy of a repeated phrase — a quoted comment, a
  // pull quote, a repeated navigation label — and the highlight lands on the
  // wrong one, dragging the viewport with it.
  function findChunkOffset(pageText, chunkText, from = 0) {
    const ahead = pageText.indexOf(chunkText, from);
    if (ahead !== -1) return ahead;
    // Nothing ahead: the page changed under us, or the hint was stale. Falling
    // back to the whole document is still better than not highlighting.
    return from > 0 ? pageText.indexOf(chunkText) : -1;
  }

  // Where to start looking for a given chunk: at the offset of the nearest
  // chunk before it that has already been located. That handles jumping
  // backwards as well as reading forwards, which a single advancing cursor
  // would not — pressing Prev would search from a point past the target.
  function searchStartFor(resolvedOffsets, chunkIndex) {
    let nearest = -1;
    let offset = 0;
    for (const key of Object.keys(resolvedOffsets)) {
      const index = Number(key);
      if (index < chunkIndex && index > nearest) {
        nearest = index;
        offset = resolvedOffsets[key];
      }
    }
    return offset;
  }

  // ─── Word spans ───────────────────────────────────────────────────────────
  // Resolve a character span for every word once, up front. Server-aligned
  // spans are authoritative; a word the server could not align is placed
  // immediately after its predecessor, so one miss does not shift the rest —
  // the next aligned word snaps the cursor back to the truth.
  function resolveWordSpans(timestamps) {
    let cursor = 0;
    for (const ts of timestamps) {
      if (ts.start_char != null && ts.end_char != null) {
        ts._start = ts.start_char;
        ts._end = ts.end_char;
      } else {
        ts._start = cursor;
        ts._end = cursor + ts.word.length;
      }
      cursor = ts._end + 1;
    }
    return timestamps;
  }

  return {
    BLOCK_SELECTOR,
    MIN_PARAGRAPH_CHARS,
    MAX_CHUNK_CHARS,
    isCitationMarker,
    paragraphsFromRoot,
    splitIntoParagraphs,
    splitAroundUrls,
    splitIntoSentences,
    splitParagraphIntoChunks,
    buildChunks,
    buildTextIndex,
    findChunkOffset,
    searchStartFor,
    resolveWordSpans,
  };
})();

// Node sees a module; the extension sees a global.
if (typeof module !== "undefined" && module.exports) {
  module.exports = ReadAloudText;
}
