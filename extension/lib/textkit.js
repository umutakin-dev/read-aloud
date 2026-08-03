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

  function paragraphsFromRoot(root) {
    const paragraphs = [];
    for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
      // A block containing another block is a wrapper — its text belongs to the
      // children, and taking both would read it twice.
      if (block.querySelector(BLOCK_SELECTOR)) continue;
      const text = block.textContent.replace(/\s+/g, " ").trim();
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
  // Long paragraphs are cut at sentence boundaries so the first audio arrives
  // quickly and prefetch has something to work ahead on. This is a synthesis
  // detail — the reader still navigates whole paragraphs.
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

  function splitParagraphIntoChunks(paragraph) {
    const chunks = [];
    for (const piece of splitAroundUrls(paragraph)) {
      if (piece.length <= MAX_CHUNK_CHARS) {
        chunks.push(piece);
        continue;
      }
      const sentences = piece.match(/[^.!?]+[.!?]+[\s)]*/g) || [piece];
      let chunk = "";
      for (const sentence of sentences) {
        if (chunk.length + sentence.length > MAX_CHUNK_CHARS && chunk.length > 0) {
          chunks.push(chunk.trim());
          chunk = "";
        }
        chunk += sentence;
      }
      if (chunk.trim().length > 0) chunks.push(chunk.trim());
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

  function buildTextIndex(root) {
    const doc = root.ownerDocument || root;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode(node) {
        // Whitespace-only nodes are kept, not rejected: the space between
        // `<span>foo</span> <span>bar</span>` lives in one, and dropping it
        // would splice the two words into "foobar".
        return isRenderedText(node) ? 1 /* ACCEPT */ : 2 /* REJECT */;
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
    paragraphsFromRoot,
    splitIntoParagraphs,
    splitAroundUrls,
    splitParagraphIntoChunks,
    buildChunks,
    buildTextIndex,
    resolveWordSpans,
  };
})();

// Node sees a module; the extension sees a global.
if (typeof module !== "undefined" && module.exports) {
  module.exports = ReadAloudText;
}
