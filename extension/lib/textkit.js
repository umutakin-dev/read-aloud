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
  // Paragraphs come from the page's structure rather than from newlines in
  // flattened text. Whether flattened text carries a newline where a paragraph
  // ended is a property of the source markup, not of the document: on Hacker
  // News it carries almost none, and a whole comment thread collapsed into two
  // "paragraphs".
  //
  // Shorter than this, a block has to end like a sentence to be read ("Agreed."
  // is a reply; "Share" is a button label).
  const MIN_PARAGRAPH_CHARS = 20;

  // ─── Citation markers ─────────────────────────────────────────────────────
  // Wikipedia's "[7]" and "[citation needed]", and a blog's footnote "¹" link,
  // are spoken mid-sentence as "seven" and break it in two (000047). They are
  // recognised by shape, not class names, so the rule holds on any site.
  //
  // Dropping one is safe for highlighting only because it is dropped on both
  // sides — from the extracted text and from the text index — by the one rule
  // below (skipped()), so a chunk is still an exact run of the indexed text.
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

  // ─── What is not read ─────────────────────────────────────────────────────
  // Our own rules on the live page (000058), in place of Readability: it
  // rebuilt the article as new HTML and its clutter rules dropped short blocks
  // under link-heavy headers, 67 of 291 comments on one Hacker News thread.
  //
  // One predicate, used by extraction and by the text index alike, decides
  // what is skipped. Whatever one side drops the other drops too, so every
  // extracted paragraph is an exact run of the indexed text.

  // Never text a reader means to hear.
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE", "SVG", "CANVAS",
    "IFRAME", "OBJECT", "EMBED", "VIDEO", "AUDIO", "MAP", "MATH",
    // Page furniture, by what the markup says it is.
    "NAV", "ASIDE", "FORM", "BUTTON", "SELECT", "OPTION", "INPUT", "TEXTAREA",
    "LABEL", "DIALOG", "MENU",
  ]);

  const SKIP_ROLES = new Set([
    "navigation", "banner", "contentinfo", "complementary", "search", "menu",
    "menubar", "toolbar", "dialog", "alertdialog", "tablist", "button",
    "tooltip", "status",
  ]);

  // An inline "[edit]" or "[–]": brackets around nothing but links. Always
  // interface, never prose. A <sup> is left to the citation rule instead, so
  // "Read citation markers" keeps deciding those.
  const INLINE_CONTROLS = new Set(["SPAN", "SMALL", "B", "I", "EM", "STRONG", "FONT"]);

  function isBracketedControl(element) {
    // Only a small inline element can be one. Checked first, because reading
    // textContent of every container on a deeply nested page (Hacker News is
    // tables inside tables) repeats the whole page's text dozens of times.
    if (!INLINE_CONTROLS.has(element.tagName) || element.childElementCount > 4) return false;
    const text = element.textContent.replace(/\s+/g, " ").trim();
    if (!BRACKETED.test(text)) return false;
    const links = [...element.querySelectorAll("a")];
    if (!links.length) return false;
    const linked = links.reduce((n, a) => n + a.textContent.trim().length, 0);
    return linked >= text.length - 2;
  }

  function isHidden(element) {
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return true;
    if (typeof element.checkVisibility === "function") {
      return !element.checkVisibility({ visibilityProperty: true });
    }
    // jsdom, in the tests: no layout, so only what the style attribute says.
    const style = element.getAttribute("style") || "";
    return /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style);
  }

  const DATA_TABLE =
    ":scope > caption, :scope > thead, :scope > tr > th, :scope > tbody > tr > th";

  function skippedHere(element, skipCitations) {
    const tag = element.tagName;
    if (SKIP_TAGS.has(tag)) return true;
    const role = element.getAttribute("role");
    if (role && SKIP_ROLES.has(role)) return true;
    // A site's header and footer go. A header inside the article or the main
    // region holds the title (Wikipedia puts its <h1> in one); a footer there
    // is still small print, unless it is an article's own.
    const within = tag === "HEADER" ? "article, main, [role=main]" : "article";
    if ((tag === "HEADER" || tag === "FOOTER") && !element.parentElement?.closest(within)) {
      return true;
    }
    // A data table (headings, a caption) reads as a stream of fragments. A
    // table without them is layout, as on Hacker News, and holds the page.
    // Only its own rows count: a nested table's headings are its own business,
    // and searching every subtree costs a lot on pages of tables in tables.
    if (tag === "TABLE" && element.querySelector(DATA_TABLE)) return true;
    // A code listing read aloud is punctuation, one symbol at a time. A <pre>
    // without <code> may be poetry or a plain-text page, and is read.
    if (tag === "PRE" && element.querySelector("code")) return true;
    if (skipCitations && tag === "SUP" && isCitationMarker(element)) return true;
    if (isBracketedControl(element)) return true;
    return isHidden(element);
  }

  // Remembers each element's answer for one pass, since the text index asks
  // for every text node's ancestors.
  function skipRule({ skipCitations = false } = {}) {
    const memo = new Map();
    const skipped = (element) => {
      if (!element || element.nodeType !== 1) return false;
      if (!memo.has(element)) {
        memo.set(element, skippedHere(element, skipCitations) || skipped(element.parentElement));
      }
      return memo.get(element);
    };
    return skipped;
  }

  // ─── Where the content is ─────────────────────────────────────────────────
  // <main> when the page marks one. Otherwise go down from <body> while a
  // single child holds nearly all of the readable text; stop where it splits,
  // which is where the content is laid out. Counted without link text, so a
  // menu weighs nothing.
  const MAIN_SHARE = 0.9;
  const CONTAINERS = new Set([
    "DIV", "SECTION", "ARTICLE", "MAIN", "CENTER", "TABLE", "TBODY", "TR", "TD",
  ]);

  function chooseRoot(doc, skipped) {
    const marked = doc.querySelector("main, [role=main]");
    if (marked && !skipped(marked)) return marked;

    const weight = new Map();
    const measure = (node, inLink) => {
      if (node.nodeType === 3) return inLink ? 0 : node.textContent.replace(/\s+/g, "").length;
      if (node.nodeType !== 1 || skipped(node)) return 0;
      let total = 0;
      const link = inLink || node.tagName === "A";
      for (const child of node.childNodes) total += measure(child, link);
      weight.set(node, total);
      return total;
    };
    const body = doc.body;
    if (!body) return doc.documentElement;
    measure(body, false);

    let root = body;
    // An article is a whole; going inside it would only lose its title.
    while (root.tagName !== "ARTICLE") {
      const total = weight.get(root) || 0;
      if (!total) break;
      let best = null;
      for (const child of root.children) {
        if ((weight.get(child) || 0) > (weight.get(best) || 0)) best = child;
      }
      if (!best || weight.get(best) < total * MAIN_SHARE) break;
      // Only into a container: a lone <p> holding 90% is still one paragraph
      // of the content, not the content.
      if (!CONTAINERS.has(best.tagName)) break;
      // The page's title is a few words beside the body of the text, so it
      // weighs little; never leave it behind.
      const title = root.querySelector("h1");
      if (title && !best.contains(title) && !skipped(title)) break;
      root = best;
    }

    // A single <article> is the content, unless it is a teaser beside it.
    const articles = root.querySelectorAll("article");
    if (articles.length === 1 && (weight.get(articles[0]) || 0) >= (weight.get(root) || 0) * 0.5) {
      return articles[0];
    }
    return root;
  }

  // ─── Paragraphs out of the page ───────────────────────────────────────────
  // Every element that starts a new line ends the paragraph before it. Text
  // sitting directly in a container is a paragraph of its own: Hacker News
  // writes a comment's first paragraph as bare text and only the rest in <p>,
  // and reading block elements alone lost that first line of every comment.
  const BREAKS = new Set([
    "ADDRESS", "ARTICLE", "BLOCKQUOTE", "BR", "CENTER", "DD", "DETAILS", "DIV",
    "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3",
    "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "OL", "P", "PRE", "SECTION",
    "SUMMARY", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
  ]);

  // A block that is mostly link text is navigation: a menu, a comment's
  // header, "reply". Judged per block, so a short comment under a header made
  // of links is still read.
  const MAX_LINK_SHARE = 0.5;

  // A heading is read however short: "Interfaces" tells the listener where
  // they are, the way it tells a reader.
  const HEADING = /^H[1-6]$/;

  // A line opening with ">" quotes what is being answered, the way comments
  // and mail do: "> hn isn't indexed" followed by a link was a whole reply on
  // Hacker News, and the length floor dropped it (000062). Page furniture
  // never starts with ">", so a quote is read however short, as a heading is.
  const QUOTE_LINE = /^>+\s*/;

  function worthReading(text, linkChars, heading) {
    if (!/[\p{L}\p{N}]/u.test(text)) return false;
    const solid = text.replace(/\s+/g, "").length;
    if (linkChars > solid * MAX_LINK_SHARE) return false;
    return (
      heading ||
      QUOTE_LINE.test(text) ||
      text.length > MIN_PARAGRAPH_CHARS ||
      /[.!?…]["'”’)\]]*$/.test(text)
    );
  }

  function extractParagraphs(doc, options = {}) {
    const skipped = skipRule(options);
    const root = chooseRoot(doc, skipped);
    const paragraphs = [];
    let parts = [];
    let linkChars = 0;
    let inHeading = false;

    const flush = () => {
      const text = parts.join("").replace(/\s+/g, " ").trim();
      if (text && worthReading(text, linkChars, inHeading)) paragraphs.push(text);
      parts = [];
      linkChars = 0;
    };

    const walk = (node, inLink) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          parts.push(child.textContent);
          if (inLink) linkChars += child.textContent.replace(/\s+/g, "").length;
        } else if (child.nodeType === 1 && !skipped(child)) {
          const breaks = BREAKS.has(child.tagName);
          if (breaks) flush();
          const outer = inHeading;
          inHeading = inHeading || HEADING.test(child.tagName);
          walk(child, inLink || child.tagName === "A");
          if (breaks) flush();
          inHeading = outer;
        }
      }
    };

    if (!skipped(root)) walk(root, false);
    flush();
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
    // The quote mark is markup, not speech. What follows it is still an exact
    // run of the page text, so the chunk is found just the same.
    for (const piece of splitAroundUrls(paragraph.replace(QUOTE_LINE, ""))) {
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

  // ─── Spoken form ──────────────────────────────────────────────────────────
  // What the engine is sent may differ from what the page shows (000063).
  // Kokoro spells "GTA VI" as "G T A vee eye"; it has to be sent "GTA six".
  // A chunk's text stays the page text, because that is what is found and
  // highlighted, and the engine's word offsets, which count into the spoken
  // text, are mapped back to it, so "six" lights up "VI".
  //
  // A Roman numeral is only I, V and X here, up to 39, which keeps CD, DC, MD
  // and MIX out. The rule is cautious, because a wrong guess breaks a reading
  // that was right:
  //   - two or more letters after a capitalised word: "GTA VI", "World War II"
  //   - a lone V or X only after an all-caps name: "GTA V", never "Malcolm X"
  //   - a lone I never: it is the pronoun
  // Always the plain number. "Henry VIII" is "Henry eight", not "the eighth";
  // telling a ruler from a title would need a list of names.
  const ROMAN = /^(X{0,3})(IX|IV|V?I{0,3})$/;
  const ROMAN_CANDIDATE = /(^|[^\p{L}\p{N}_'’-])([IVX]+)(?![\p{L}\p{N}_-])/gu;
  const ROMAN_VALUES = { I: 1, V: 5, X: 10 };
  const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty"];

  function romanValue(letters) {
    if (!ROMAN.test(letters)) return 0;
    let total = 0;
    for (let i = 0; i < letters.length; i++) {
      const value = ROMAN_VALUES[letters[i]];
      const next = ROMAN_VALUES[letters[i + 1]] || 0;
      total += value < next ? -value : value;
    }
    return total;
  }

  function numberWords(n) {
    if (n < 10) return ONES[n];
    if (n < 20) return TEENS[n - 10];
    const ones = ONES[n % 10];
    return TENS[Math.floor(n / 10)] + (ones ? `-${ones}` : "");
  }

  // The word just before `at`, if only spaces separate the two.
  function wordBefore(text, at) {
    const match = text.slice(0, at).match(/([\p{L}\p{N}]+) +$/u);
    return match ? match[1] : null;
  }

  function isRomanNumeral(text, at, letters) {
    if (letters === "I" || !romanValue(letters)) return false;
    const before = wordBefore(text, at);
    if (!before || !/^\p{Lu}/u.test(before)) return false;
    if (letters.length > 1) return true;
    return before.length > 1 && before === before.toUpperCase() && /\p{Lu}/u.test(before);
  }

  // A run the rule above keeps as letters still has to reach the engine as
  // letters. The browser engine voices words through espeak-ng, which reads
  // any run it can place as a numeral with "roman" in front: "an IV drip" was
  // "an roman four drip", "XX" "roman twenty" (000066). Hyphenated, "I-V" is
  // read letter by letter by espeak and by the server's misaki alike.
  function romanNumerals(text) {
    const found = [];
    for (const match of text.matchAll(ROMAN_CANDIDATE)) {
      const at = match.index + match[1].length;
      const letters = match[2];
      if (isRomanNumeral(text, at, letters)) {
        found.push({ at, length: letters.length, words: numberWords(romanValue(letters)) });
      } else if (letters.length > 1) {
        found.push({ at, length: letters.length, words: letters.split("").join("-") });
      }
    }
    return found;
  }

  // Kokoro read "$3.8B" as "three point eight B" and "825M" as "825 M"
  // (000064). An amount with a unit letter is sent as words, the currency
  // last, the way it is said: "3.8 billion dollars". The digits stay digits;
  // both engines read those well.
  //   - M and B (and "bn") count on their own: "825M", "32.5M units"
  //   - K and T only after a currency sign, since "4K" alone is usually a
  //     screen and "3T" a magnet; lowercase "m" and "b" too, as in "£5m"
  // An amount without a unit ("$825") is left to the engine, which says it.
  const AMOUNT = /(^|[^\p{L}\p{N}_.,])([$€£])?(\d+(?:,\d{3})*(?:\.\d+)?)(bn|tn|[KkMmBbT])(?![\p{L}\p{N}_])/gu;
  const UNIT_WORDS = { k: "thousand", m: "million", b: "billion", bn: "billion", t: "trillion", tn: "trillion" };
  const CURRENCY_WORDS = { $: "dollars", "€": "euros", "£": "pounds" };
  const UNIT_WITHOUT_CURRENCY = new Set(["M", "B", "bn"]);

  function amounts(text) {
    const found = [];
    for (const match of text.matchAll(AMOUNT)) {
      const [, lead, currency, digits, unit] = match;
      if (!currency && !UNIT_WITHOUT_CURRENCY.has(unit)) continue;
      const at = match.index + lead.length;
      const length = match[0].length - lead.length;
      const words = [digits, UNIT_WORDS[unit.toLowerCase()], currency && CURRENCY_WORDS[currency]];
      found.push({ at, length, words: words.filter(Boolean).join(" ") });
    }
    return found;
  }

  // "~" before a number means about it: "~$2.5B" is "about 2.5 billion
  // dollars" (000064). Elsewhere it is left alone.
  const APPROXIMATELY = /(^|[\s(])~(?=[$€£]?\d)/g;

  function approximations(text) {
    return [...text.matchAll(APPROXIMATELY)].map((match) => ({
      at: match.index + match[1].length,
      length: 1,
      words: "about ",
    }));
  }

  // The text to send, and the edits that turn a spoken offset back into a page
  // offset: each says where it starts in both texts and how long it is in each.
  // Each rule names the page runs it replaces; where two claim the same text,
  // the one starting first wins.
  function spokenForm(text) {
    const replacements = [...romanNumerals(text), ...amounts(text), ...approximations(text)].sort(
      (a, b) => a.at - b.at
    );
    const edits = [];
    let spoken = "";
    let cursor = 0;
    for (const { at, length, words } of replacements) {
      if (at < cursor) continue;
      spoken += text.slice(cursor, at);
      edits.push({ spokenAt: spoken.length, spokenLength: words.length, pageAt: at, pageLength: length });
      spoken += words;
      cursor = at + length;
    }
    spoken += text.slice(cursor);
    return { text: spoken, edits };
  }

  // A spoken offset as a page offset. One inside a replaced word goes to that
  // word's start, or its end when it closes a span.
  function pageOffset(offset, edits, closing) {
    let shift = 0;
    for (const edit of edits) {
      if (closing ? offset <= edit.spokenAt : offset < edit.spokenAt) break;
      const end = edit.spokenAt + edit.spokenLength;
      if (offset < end || offset === end && closing) {
        return closing ? edit.pageAt + edit.pageLength : edit.pageAt;
      }
      shift = edit.pageAt + edit.pageLength - (edit.spokenAt + edit.spokenLength);
    }
    return offset + shift;
  }

  // Rewrites each word's span from the spoken text into the page text, in
  // place. A word without a span is left for resolveWordSpans to estimate.
  function spansToPage(timestamps, edits) {
    if (!edits.length || !Array.isArray(timestamps)) return timestamps;
    for (const ts of timestamps) {
      if (ts.start_char == null || ts.end_char == null) continue;
      ts.start_char = pageOffset(ts.start_char, edits, false);
      ts.end_char = pageOffset(ts.end_char, edits, true);
    }
    return timestamps;
  }

  // ─── Text index ───────────────────────────────────────────────────────────
  // Chunk text has its whitespace collapsed, so the page text has to be
  // collapsed identically or the chunk is never found. We build that collapsed
  // string alongside a per-character map back into the DOM, which is what lets a
  // character span become a Range.
  const WHITESPACE = /\s/;

  function buildTextIndex(root, options = {}) {
    const doc = root.ownerDocument || root;
    // The same rule extraction uses, so every paragraph it found is an exact
    // run of this text: a node skipped on one side and not the other would
    // leave every chunk after it unmatchable (000047, 000058).
    const skipped = skipRule(options);
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode(node) {
        // Whitespace-only nodes are kept, not rejected: the space between
        // `<span>foo</span> <span>bar</span>` lives in one, and dropping it
        // would splice the two words into "foobar".
        return skipped(node.parentElement) ? 2 /* REJECT */ : 1 /* ACCEPT */;
      },
    });

    let text = "";
    const nodes = []; // nodes[i] + offsets[i] locate text[i] in the DOM
    const offsets = [];
    // The reverse: where each text node's first character landed in `text`,
    // so a point on the page (a selection's start) becomes a position (000039).
    const starts = new Map();
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
        if (!starts.has(node)) starts.set(node, nodes.length);
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

    return { text, nodes, offsets, starts };
  }

  // Where a point on the page falls in the index text, for a Range boundary
  // (node, offset). A point in a text node the index skipped, or between
  // elements, moves forward to the next indexed character. -1 when nothing
  // indexed follows it.
  function positionInIndex(index, node, offset) {
    if (!index?.starts || !node) return -1;
    // A collapsed space is stored under the node after it, so a point at the
    // start of a paragraph would land on the space before it, outside every
    // sentence. Step over it.
    const settle = (i) => {
      while (i < index.text.length && index.text[i] === " ") i++;
      return i < index.text.length ? i : -1;
    };
    if (node.nodeType === 3 && index.starts.has(node)) {
      let i = index.starts.get(node);
      while (i < index.nodes.length && index.nodes[i] === node && index.offsets[i] < offset) i++;
      return settle(i);
    }
    // Find the first indexed text node at or after the point.
    const doc = node.ownerDocument || node;
    const walker = doc.createTreeWalker(doc.body || doc, 4 /* SHOW_TEXT */);
    let from = node;
    if (node.nodeType === 1) {
      const child = node.childNodes[offset];
      if (child) from = child;
      else {
        // Past the last child: continue after this element's subtree.
        from = node;
        while (from && !from.nextSibling) from = from.parentNode;
        from = from?.nextSibling;
      }
    }
    if (!from) return -1;
    if (from.nodeType === 3 && index.starts.has(from)) return settle(index.starts.get(from));
    walker.currentNode = from;
    for (let next = walker.nextNode(); next; next = walker.nextNode()) {
      if (index.starts.has(next)) return settle(index.starts.get(next));
    }
    return -1;
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
    MIN_PARAGRAPH_CHARS,
    MAX_CHUNK_CHARS,
    isCitationMarker,
    extractParagraphs,
    skipRule,
    splitIntoParagraphs,
    splitAroundUrls,
    spokenForm,
    spansToPage,
    splitIntoSentences,
    splitParagraphIntoChunks,
    buildChunks,
    buildTextIndex,
    findChunkOffset,
    positionInIndex,
    searchStartFor,
    resolveWordSpans,
  };
})();

// Node sees a module; the extension sees a global.
if (typeof module !== "undefined" && module.exports) {
  module.exports = ReadAloudText;
}
