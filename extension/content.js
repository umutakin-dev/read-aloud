(() => {
  "use strict";

  // This file is injected on demand, so it can run twice in one isolated world:
  // two invocations racing, or a copy orphaned by an extension reload whose
  // context is dead but whose globals are still here. A plain "already loaded"
  // flag would lock that tab out of a fresh injection — precisely the case
  // on-demand injection exists to fix — so the previous copy is torn down and
  // replaced instead.
  if (typeof window.__readAloudTeardown === "function") {
    try {
      window.__readAloudTeardown();
    } catch (e) {
      // The previous copy's extension context is already invalidated, which
      // makes its listeners inert anyway.
    }
  }

  // The handshake above only reaches a copy new enough to publish that hook.
  // A copy left by a build that predates it — or one whose context died partway
  // through its own cleanup — strands its toolbar in the page instead. Clear any
  // stray host directly so a fresh injection never stacks a second one on top.
  document.getElementById("read-aloud-toolbar-host")?.remove();

  // Same reasoning for the highlight registry: it is per-document, so an
  // orphaned copy's ranges outlive it and would sit on the page as a dead
  // highlight until something else cleared them.
  if (CSS.highlights) {
    CSS.highlights.delete("read-aloud-word");
    CSS.highlights.delete("read-aloud-sentence");
  }

  // ─── State ──────────────────────────────────────────────────────────────────
  let state = {
    active: false,
    playing: false,
    // Two different units. Chunks are what gets synthesized and played — capped
    // so playback starts quickly and prefetch can stay ahead. Paragraphs are
    // what the reader navigates by. A long paragraph spans several chunks.
    chunks: [],            // [{ text, paragraph }]
    paragraphStarts: [],   // chunk index each paragraph begins at
    currentChunk: 0,
    timestamps: [],
    speed: 1.0,
    voice: "af_heart",
    serverUrl: "http://localhost:7860",
    useServer: true,       // false = Web Speech API fallback
    serverHealthy: null,   // last observed health, independent of what is in use
    toolbar: null,
    utterance: null,       // for Web Speech API fallback
    prefetchCache: {},     // chunk index -> TTS response data
    healthCheckTimer: null,
    animFrameId: null,
    textIndex: null,       // { text, nodes, offsets } — collapsed page text mapped to the DOM
  };

  function paragraphCount() {
    return state.paragraphStarts.length;
  }

  function currentParagraph() {
    return state.chunks[state.currentChunk]?.paragraph ?? 0;
  }

  // CSS Custom Highlight API registries
  let wordHighlight = null;
  let sentenceHighlight = null;

  if (CSS.highlights) {
    wordHighlight = new Highlight();
    sentenceHighlight = new Highlight();
    CSS.highlights.set("read-aloud-word", wordHighlight);
    CSS.highlights.set("read-aloud-sentence", sentenceHighlight);
  }

  // ─── Load settings ──────────────────────────────────────────────────────────
  async function loadSettings() {
    const result = await chrome.storage.local.get(["voice", "speed", "serverUrl"]);
    if (result.voice) state.voice = result.voice;
    if (result.speed) state.speed = result.speed;
    if (result.serverUrl) state.serverUrl = result.serverUrl;
  }

  // ─── Text Extraction ───────────────────────────────────────────────────────
  function extractArticleText() {
    try {
      const clone = document.cloneNode(true);
      const reader = new Readability(clone);
      const article = reader.parse();
      if (article && article.textContent && article.textContent.trim().length > 100) {
        return article.textContent;
      }
    } catch (e) {
      console.warn("Read Aloud: Readability failed, falling back to body text", e);
    }
    return document.body.innerText;
  }

  function splitIntoParagraphs(text) {
    // First try double newlines
    let paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 20);

    // If too few paragraphs, try single newlines
    if (paragraphs.length <= 1) {
      paragraphs = text
        .split(/\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter((p) => p.length > 20);
    }

    return paragraphs;
  }

  // Long paragraphs are cut at sentence boundaries so the first audio arrives
  // quickly and prefetch has something to work ahead on. This is a synthesis
  // detail — the reader still navigates whole paragraphs.
  const MAX_CHUNK_CHARS = 500;

  function splitParagraphIntoChunks(paragraph) {
    if (paragraph.length <= MAX_CHUNK_CHARS) return [paragraph];

    const sentences = paragraph.match(/[^.!?]+[.!?]+[\s)]*/g) || [paragraph];
    const chunks = [];
    let chunk = "";
    for (const sentence of sentences) {
      if (chunk.length + sentence.length > MAX_CHUNK_CHARS && chunk.length > 0) {
        chunks.push(chunk.trim());
        chunk = "";
      }
      chunk += sentence;
    }
    if (chunk.trim().length > 0) chunks.push(chunk.trim());
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

  // ─── Text Index ───────────────────────────────────────────────────────────
  // splitIntoParagraphs collapses whitespace, so the page text has to be
  // collapsed identically or the paragraph is never found. We build that
  // collapsed string alongside a per-character map back into the DOM, which is
  // what lets a character span become a Range.
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

  function buildTextIndex() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Whitespace-only nodes are kept, not rejected: the space between
          // `<span>foo</span> <span>bar</span>` lives in one, and dropping it
          // would splice the two words into "foobar".
          return isRenderedText(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      }
    );

    let text = "";
    const nodes = [];    // nodes[i] + offsets[i] locate text[i] in the DOM
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

  function findParagraphOffset(paragraphText) {
    if (!state.textIndex) state.textIndex = buildTextIndex();

    let idx = state.textIndex.text.indexOf(paragraphText);
    if (idx === -1) {
      // The page may have changed since the index was built — lazy-loaded
      // images, expanding sections, ads settling. Rebuild once before giving up.
      state.textIndex = buildTextIndex();
      idx = state.textIndex.text.indexOf(paragraphText);
    }
    if (idx === -1) {
      // Readability sometimes alters a paragraph slightly (entity decoding,
      // dropped inline nodes). A prefix match still anchors the highlight.
      const probe = paragraphText.slice(0, 60);
      if (probe.length >= 20) idx = state.textIndex.text.indexOf(probe);
    }
    if (idx === -1) {
      console.warn(
        "Read Aloud: paragraph not found in page DOM, highlighting disabled for it:",
        paragraphText.slice(0, 60)
      );
      return null;
    }
    return idx;
  }

  // `end` is exclusive. Anchoring the end to the last character rather than the
  // position after it keeps the Range off a collapsed space, which may belong to
  // a different text node than the character preceding it.
  function createRangeForSpan(start, end, index) {
    if (!index || start < 0 || end <= start || end > index.text.length) return null;
    try {
      const range = document.createRange();
      range.setStart(index.nodes[start], index.offsets[start]);
      range.setEnd(index.nodes[end - 1], index.offsets[end - 1] + 1);
      return range;
    } catch (e) {
      // Node detached since the index was built.
      return null;
    }
  }

  // ─── Highlighting ──────────────────────────────────────────────────────────
  let lastHighlightedWord = -1;

  function clearHighlights() {
    if (wordHighlight) wordHighlight.clear();
    if (sentenceHighlight) sentenceHighlight.clear();
    lastHighlightedWord = -1;
  }

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

  function scrollRangeIntoView(range) {
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
    const el = range.startContainer.parentElement;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const SENTENCE_END = /[.!?;]$/;

  function highlightWord(timestamps, currentTime, index, paragraphOffset) {
    // Loose check on purpose — the offset is undefined until the first
    // paragraph resolves, and arithmetic on that would silently produce NaN.
    if (!wordHighlight || !index || paragraphOffset == null) return;

    let current = -1;
    for (let i = 0; i < timestamps.length; i++) {
      if (currentTime >= timestamps[i].start && currentTime < timestamps[i].end) {
        current = i;
        break;
      }
    }
    // Nothing to do between words, and repeating the work every frame would
    // re-trigger the smooth scroll below before it has finished.
    if (current === -1 || current === lastHighlightedWord) return;
    lastHighlightedWord = current;

    wordHighlight.clear();
    sentenceHighlight.clear();

    const word = timestamps[current];
    const wordRange = createRangeForSpan(
      paragraphOffset + word._start,
      paragraphOffset + word._end,
      index
    );
    if (wordRange) {
      wordHighlight.add(wordRange);
      scrollRangeIntoView(wordRange);
    }

    // Sentence runs from just after the previous terminator to the next one.
    let first = current;
    let last = current;
    while (first > 0 && !SENTENCE_END.test(timestamps[first - 1].word)) first--;
    while (last < timestamps.length - 1 && !SENTENCE_END.test(timestamps[last].word)) last++;

    const sentRange = createRangeForSpan(
      paragraphOffset + timestamps[first]._start,
      paragraphOffset + timestamps[last]._end,
      index
    );
    if (sentRange) sentenceHighlight.add(sentRange);
  }

  // ─── Animation loop for highlighting ──────────────────────────────────────
  function startHighlightLoop() {
    function tick() {
      if (!state.playing) return;
      highlightWord(
        state.timestamps,
        state._currentTime || 0,
        state.textIndex,
        state._paragraphOffset
      );
      state.animFrameId = requestAnimationFrame(tick);
    }
    state.animFrameId = requestAnimationFrame(tick);
  }

  function stopHighlightLoop() {
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
  }

  // ─── Server Communication (via background service worker) ────────────────
  async function checkServerHealth() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "HEALTH_CHECK", serverUrl: state.serverUrl },
        (response) => {
          resolve(response && response.ok);
        }
      );
    });
  }

  // Audio is always synthesized at 1.0x and sped up at playback time via
  // audio.playbackRate. Doing it server-side too would compound the two rates,
  // and would bake a speed into every prefetched paragraph.
  async function requestTTSWithTimestamps(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "TTS_REQUEST",
          text,
          voice: state.voice,
          serverUrl: state.serverUrl,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.ok) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || "TTS request failed"));
          }
        }
      );
    });
  }

  // ─── Audio Playback (via offscreen document through background) ─────────
  // Playback lives in the offscreen document, so "this paragraph finished" is
  // a message rather than an event on an audio element. The promise for it must
  // be settled on every exit path — including cancellation — or the awaiting
  // call sits pending forever, holding its whole closure alive.
  let audioResolve = null;
  let audioReject = null;

  function finishAudio(outcome) {
    if (!audioResolve) return;
    const resolve = audioResolve;
    audioResolve = null;
    audioReject = null;
    resolve(outcome);
  }

  function failAudio(err) {
    if (!audioReject) return;
    const reject = audioReject;
    audioResolve = null;
    audioReject = null;
    reject(err);
  }

  // Listen for audio events relayed from background
  function onAudioMessage(msg) {
    if (msg.type === "AUDIO_TIME" && state.playing) {
      state._currentTime = msg.currentTime;
    }
    if (msg.type === "AUDIO_ENDED") {
      finishAudio("ended");
    }
    if (msg.type === "AUDIO_ERROR") {
      failAudio(new Error(msg.message || "Audio playback error"));
    }
  }

  chrome.runtime.onMessage.addListener(onAudioMessage);

  function playAudioFromBase64(base64) {
    return new Promise((resolve, reject) => {
      audioResolve = resolve;
      audioReject = reject;
      chrome.runtime.sendMessage({
        type: "PLAY_AUDIO",
        audio_base64: base64,
        speed: state.speed,
      }, (response) => {
        // Reading lastError also stops Chrome logging it as unchecked.
        if (chrome.runtime.lastError) {
          failAudio(new Error(chrome.runtime.lastError.message));
        } else if (response && !response.ok) {
          failAudio(new Error(response.error || "Audio play failed"));
        }
      });
    });
  }

  async function prefetchChunk(index) {
    if (index >= state.chunks.length || state.prefetchCache[index]) return;
    try {
      const data = await requestTTSWithTimestamps(state.chunks[index].text);
      state.prefetchCache[index] = data;
    } catch (e) {
      // Silently fail prefetch
    }
  }

  async function playChunkWithServer(index) {
    if (index >= state.chunks.length) {
      stopReadAloud();
      return;
    }

    // Cancel any browser TTS that might be running
    speechSynthesis.cancel();
    state.utterance = null;

    state.currentChunk = index;
    updateToolbarStatus(`Paragraph ${currentParagraph() + 1}/${paragraphCount()}`);

    try {
      let data;
      if (state.prefetchCache[index]) {
        data = state.prefetchCache[index];
        delete state.prefetchCache[index];
      } else {
        data = await requestTTSWithTimestamps(state.chunks[index].text);
      }

      if (!state.active) return;

      state.timestamps = resolveWordSpans(data.timestamps || []);
      state._paragraphOffset = findParagraphOffset(state.chunks[index].text);
      lastHighlightedWord = -1;
      // Kept so playback can be rebuilt if Chrome discards the offscreen
      // document during a pause — see resumePlayback.
      state._audioBase64 = data.audio_base64;

      state.playing = true;
      startHighlightLoop();

      // Prefetch the next chunks, which may run into the following paragraph
      for (let i = 1; i <= 2; i++) {
        prefetchChunk(index + i);
      }

      const outcome = await playAudioFromBase64(data.audio_base64);

      // Stop/prev/next already tore down the highlight state and may have
      // started somewhere else — leave it alone.
      if (outcome === "cancelled") return;

      stopHighlightLoop();
      clearHighlights();

      if (state.active && state.playing) {
        state.playing = false;
        playChunkWithServer(index + 1);
      }
    } catch (err) {
      console.error("Read Aloud: TTS playback error", err);
      // Only fall back if the server is actually down, not on transient audio errors
      const serverOk = await checkServerHealth();
      if (!state.active) return;
      state.serverHealthy = serverOk;
      if (!serverOk) {
        state.useServer = false;
        updateEngineIndicator();
        // Re-check on the way in: stopping during the delay must not restart it.
        setTimeout(() => state.active && playChunkWithWebSpeech(index), 1000);
      } else {
        updateToolbarStatus(`Retrying paragraph ${currentParagraph() + 1}...`);
        setTimeout(() => state.active && playChunkWithServer(index), 500);
      }
    }
  }

  // ─── Web Speech API Fallback ──────────────────────────────────────────────
  function playChunkWithWebSpeech(index) {
    if (index >= state.chunks.length) {
      stopReadAloud();
      return;
    }

    state.currentChunk = index;
    updateToolbarStatus(`Paragraph ${currentParagraph() + 1}/${paragraphCount()}`);

    const chunkText = state.chunks[index].text;
    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.rate = state.speed;
    state.utterance = utterance;

    // Word boundary highlighting
    state._paragraphOffset = findParagraphOffset(chunkText);

    utterance.onboundary = (event) => {
      if (event.name !== "word" || !state.textIndex || state._paragraphOffset == null) return;
      // charLength is optional in the spec and Chrome omits it, so measure the
      // word at charIndex ourselves when it is missing.
      const length =
        event.charLength || (chunkText.slice(event.charIndex).match(/^\S+/) || [""])[0].length;
      if (!length) return;

      const charStart = state._paragraphOffset + event.charIndex;
      const range = createRangeForSpan(charStart, charStart + length, state.textIndex);
      if (range) {
        wordHighlight.clear();
        wordHighlight.add(range);
        scrollRangeIntoView(range);
      }
    };

    utterance.onend = () => {
      clearHighlights();
      if (state.active) {
        playChunkWithWebSpeech(index + 1);
      }
    };

    utterance.onerror = (e) => {
      if (e.error !== "canceled") {
        console.error("Read Aloud: Web Speech error", e);
      }
      clearHighlights();
    };

    state.playing = true;
    speechSynthesis.speak(utterance);
  }

  function playCurrentChunk() {
    if (state.useServer) {
      playChunkWithServer(state.currentChunk);
    } else {
      playChunkWithWebSpeech(state.currentChunk);
    }
  }

  // ─── Health Check Timer ────────────────────────────────────────────────────
  // Polls in both directions. Previously it only ran while already fallen back,
  // so a server that died mid-article went unreported until the next chunk
  // failed — the toolbar kept claiming Kokoro while nothing was wrong yet.
  function startHealthCheckTimer() {
    state.healthCheckTimer = setInterval(async () => {
      const healthy = await checkServerHealth();
      if (!state.active || healthy === state.serverHealthy) return;
      state.serverHealthy = healthy;

      // Recovering is safe to act on immediately; going down is not. The
      // current chunk may already be playing from cache, and one failed poll
      // is not reason enough to drop to browser TTS — the playback error path
      // handles that with better evidence.
      if (healthy && !state.useServer) {
        state.useServer = true;
      }
      updateEngineIndicator();
    }, 15000);
  }

  function stopHealthCheckTimer() {
    if (state.healthCheckTimer) {
      clearInterval(state.healthCheckTimer);
      state.healthCheckTimer = null;
    }
  }

  // ─── Toolbar UI ────────────────────────────────────────────────────────────
  function createToolbar() {
    if (state.toolbar) return state.toolbar;

    const host = document.createElement("div");
    host.id = "read-aloud-toolbar-host";
    const shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .toolbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #1e1e2e;
          color: #cdd6f4;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          user-select: none;
        }
        button {
          background: none;
          border: 1px solid #585b70;
          color: #cdd6f4;
          border-radius: 6px;
          padding: 4px 10px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          transition: background 0.15s;
        }
        button:hover {
          background: #313244;
        }
        button.active {
          background: #89b4fa;
          color: #1e1e2e;
          border-color: #89b4fa;
        }
        .status {
          flex: 1;
          text-align: center;
          color: #a6adc8;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .speed-group {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        input[type="range"] {
          width: 80px;
          accent-color: #89b4fa;
        }
        .speed-label {
          font-size: 12px;
          color: #a6adc8;
          min-width: 32px;
          text-align: center;
        }
        .close-btn {
          border: none;
          font-size: 18px;
          padding: 2px 6px;
        }
        .engine {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          color: #a6adc8;
          white-space: nowrap;
          cursor: default;
        }
        .engine::before {
          content: "";
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #6c7086;
        }
        .engine.ok::before { background: #a6e3a1; }
        .engine.warn::before { background: #f9e2af; }
        .engine.fallback::before { background: #fab387; }
      </style>
      <div class="toolbar">
        <button id="btn-prev" title="Previous paragraph">&#9664;&#9664;</button>
        <button id="btn-play" title="Play/Pause" class="active">&#9654;</button>
        <button id="btn-next" title="Next paragraph">&#9654;&#9654;</button>
        <button id="btn-stop" title="Stop">&#9632;</button>
        <div class="speed-group">
          <span class="speed-label" id="speed-label">1.0x</span>
          <input type="range" id="speed-slider" min="0.5" max="3" step="0.1" value="1.0" />
        </div>
        <span class="status" id="status">Starting...</span>
        <span class="engine" id="engine">Connecting</span>
        <button class="close-btn" id="btn-close" title="Close">&times;</button>
      </div>
    `;

    const toolbar = shadow.querySelector(".toolbar");
    const btnPlay = shadow.getElementById("btn-play");
    const btnPrev = shadow.getElementById("btn-prev");
    const btnNext = shadow.getElementById("btn-next");
    const btnStop = shadow.getElementById("btn-stop");
    const btnClose = shadow.getElementById("btn-close");
    const speedSlider = shadow.getElementById("speed-slider");
    const speedLabel = shadow.getElementById("speed-label");

    speedSlider.value = state.speed;
    speedLabel.textContent = `${state.speed}x`;

    btnPlay.addEventListener("click", () => {
      if (state.playing) {
        pausePlayback();
        btnPlay.innerHTML = "&#9654;";
        btnPlay.classList.remove("active");
      } else {
        resumePlayback();
        btnPlay.innerHTML = "&#10074;&#10074;";
        btnPlay.classList.add("active");
      }
    });

    // Prev/next move a whole paragraph, however many chunks it was split into.
    function jumpToParagraph(index) {
      if (index < 0 || index >= paragraphCount()) return;
      stopCurrentAudio();
      state.currentChunk = state.paragraphStarts[index];
      playCurrentChunk();
    }

    btnPrev.addEventListener("click", () => {
      const here = currentParagraph();
      // Part-way into a paragraph, Prev restarts it rather than skipping back,
      // the way a track-skip does. At the start, it goes to the previous one.
      const atStart = state.currentChunk === state.paragraphStarts[here];
      jumpToParagraph(atStart ? here - 1 : here);
    });

    btnNext.addEventListener("click", () => {
      jumpToParagraph(currentParagraph() + 1);
    });

    btnStop.addEventListener("click", stopReadAloud);
    btnClose.addEventListener("click", stopReadAloud);

    speedSlider.addEventListener("input", () => {
      const val = parseFloat(speedSlider.value);
      state.speed = val;
      speedLabel.textContent = `${val.toFixed(1)}x`;
      chrome.runtime.sendMessage({ type: "SET_AUDIO_SPEED", speed: val });
      chrome.storage.local.set({ speed: val });
    });

    document.body.appendChild(host);
    state.toolbar = host;
    state._shadow = shadow;
    return host;
  }

  function updateToolbarStatus(text) {
    if (!state._shadow) return;
    const status = state._shadow.getElementById("status");
    if (status) status.textContent = text;
  }

  // Which engine is producing the audio is persistent state, so it gets its own
  // persistent indicator rather than borrowing the status line — which is
  // rewritten on every chunk and so lost any "(Browser TTS)" suffix almost
  // immediately.
  function updateEngineIndicator() {
    if (!state._shadow) return;
    const el = state._shadow.getElementById("engine");
    if (!el) return;

    let label, cls, title;
    if (!state.useServer) {
      label = "Browser TTS";
      cls = "engine fallback";
      title = "Kokoro server unavailable — using the browser's built-in speech";
    } else if (state.serverHealthy === false) {
      label = "Reconnecting";
      cls = "engine warn";
      title = "Kokoro server is not responding; will fall back if it stays down";
    } else if (state.serverHealthy === null) {
      label = "Connecting";
      cls = "engine";
      title = "Checking the Kokoro TTS server";
    } else {
      label = "Kokoro";
      cls = "engine ok";
      title = `Using the Kokoro TTS server at ${state.serverUrl}`;
    }

    el.textContent = label;
    el.className = cls;
    el.title = title;
  }

  function updatePlayButton(isPlaying) {
    if (!state._shadow) return;
    const btn = state._shadow.getElementById("btn-play");
    if (btn) {
      btn.innerHTML = isPlaying ? "&#10074;&#10074;" : "&#9654;";
      if (isPlaying) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  }

  function removeToolbar() {
    if (state.toolbar) {
      state.toolbar.remove();
      state.toolbar = null;
      state._shadow = null;
    }
  }

  // ─── Playback Controls ────────────────────────────────────────────────────
  function stopCurrentAudio() {
    stopHighlightLoop();
    clearHighlights();
    state.playing = false;
    state._currentTime = 0;
    chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
    // Settle rather than drop it — a pending promise here would strand the
    // paragraph that is awaiting it.
    finishAudio("cancelled");
    if (state.utterance) {
      speechSynthesis.cancel();
      state.utterance = null;
    }
  }

  function pausePlayback() {
    state.playing = false;
    stopHighlightLoop();
    chrome.runtime.sendMessage({ type: "PAUSE_AUDIO" });
    if (state.utterance) {
      speechSynthesis.pause();
    }
  }

  function resumePlayback() {
    if (state.utterance) {
      state.playing = true;
      speechSynthesis.resume();
      return;
    }
    if (!audioResolve) {
      playCurrentChunk();
      return;
    }

    state.playing = true;
    chrome.runtime.sendMessage({ type: "RESUME_AUDIO" }, (response) => {
      if (chrome.runtime.lastError || !response?.resumed) {
        // Chrome discards an AUDIO_PLAYBACK offscreen document once it stops
        // playing, so a pause of more than a minute or two leaves nothing to
        // resume. Rebuild it and pick up from where the audio had reached.
        replayFromCurrentPosition();
        return;
      }
      startHighlightLoop();
    });
  }

  function replayFromCurrentPosition() {
    if (!state._audioBase64) {
      // Nothing cached to replay from — restart the chunk.
      playCurrentChunk();
      return;
    }
    chrome.runtime.sendMessage(
      {
        type: "PLAY_AUDIO",
        audio_base64: state._audioBase64,
        speed: state.speed,
        startAt: state._currentTime || 0,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          failAudio(new Error(chrome.runtime.lastError.message));
        } else if (response && !response.ok) {
          failAudio(new Error(response.error || "Audio replay failed"));
        } else {
          // The promise from the original play is still pending and will settle
          // on AUDIO_ENDED as usual, so nothing else needs rewiring.
          startHighlightLoop();
        }
      }
    );
  }

  // ─── Main Toggle ──────────────────────────────────────────────────────────
  async function toggleReadAloud(selectedText) {
    if (state.active) {
      stopReadAloud();
      return;
    }

    await loadSettings();
    state.active = true;
    state.prefetchCache = {};

    createToolbar();
    updateToolbarStatus("Extracting text...");

    // Extract text
    let text;
    if (selectedText) {
      text = selectedText;
    } else {
      text = extractArticleText();
    }

    const paragraphs = splitIntoParagraphs(text);
    const built = buildChunks(paragraphs);
    state.chunks = built.chunks;
    state.paragraphStarts = built.paragraphStarts;

    if (state.chunks.length === 0) {
      updateToolbarStatus("No readable text found");
      setTimeout(stopReadAloud, 3000);
      return;
    }

    updateToolbarStatus(`Found ${paragraphCount()} paragraphs. Checking server...`);
    updateEngineIndicator();

    // Check server health
    const serverOk = await checkServerHealth();
    state.serverHealthy = serverOk;
    state.useServer = serverOk;
    updateEngineIndicator();

    state.currentChunk = 0;
    updatePlayButton(true);
    playCurrentChunk();
    startHealthCheckTimer();
  }

  function stopReadAloud() {
    stopCurrentAudio();
    stopHighlightLoop();
    stopHealthCheckTimer();
    clearHighlights();
    removeToolbar();
    chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
    state.active = false;
    state.playing = false;
    state.chunks = [];
    state.paragraphStarts = [];
    state.currentChunk = 0;
    state.timestamps = [];
    state.prefetchCache = {};
    state.textIndex = null;
    state._paragraphOffset = null;
    state._currentTime = 0;
    state._audioBase64 = null;
  }

  // ─── Message Listener ─────────────────────────────────────────────────────
  function onToggleMessage(message) {
    if (message.type === "TOGGLE_READ_ALOUD") {
      toggleReadAloud(message.selectedText);
    }
  }

  chrome.runtime.onMessage.addListener(onToggleMessage);

  // Published so a later injection can replace this copy cleanly. DOM and timer
  // cleanup comes first: everything below it can throw once this copy's
  // extension context has been invalidated, and a stranded toolbar or a live
  // health-check interval is what the user would actually notice.
  window.__readAloudTeardown = () => {
    removeToolbar();
    stopHighlightLoop();
    stopHealthCheckTimer();
    clearHighlights();
    speechSynthesis.cancel();
    state.active = false;
    state.playing = false;
    chrome.runtime.onMessage.removeListener(onAudioMessage);
    chrome.runtime.onMessage.removeListener(onToggleMessage);
    chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
  };
})();
