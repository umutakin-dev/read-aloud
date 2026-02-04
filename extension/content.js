(() => {
  "use strict";

  // ─── State ──────────────────────────────────────────────────────────────────
  let state = {
    active: false,
    playing: false,
    paragraphs: [],
    currentParagraph: 0,
    audio: null,
    timestamps: [],
    speed: 1.0,
    voice: "af_heart",
    serverUrl: "http://localhost:7860",
    useServer: true,       // false = Web Speech API fallback
    toolbar: null,
    utterance: null,       // for Web Speech API fallback
    prefetchCache: {},     // paragraph index -> TTS response data
    healthCheckTimer: null,
    animFrameId: null,
    textNodeMap: null,      // array of { node, start, end } for current paragraph DOM
  };

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

    // Split any paragraph over 500 chars into sentences
    const result = [];
    for (const para of paragraphs) {
      if (para.length <= 500) {
        result.push(para);
      } else {
        // Split on sentence boundaries
        const sentences = para.match(/[^.!?]+[.!?]+[\s)]*/g) || [para];
        let chunk = "";
        for (const sent of sentences) {
          if (chunk.length + sent.length > 500 && chunk.length > 0) {
            result.push(chunk.trim());
            chunk = "";
          }
          chunk += sent;
        }
        if (chunk.trim().length > 0) {
          result.push(chunk.trim());
        }
      }
    }

    return result.length > 0 ? result : paragraphs;
  }

  // ─── Text Node Mapping ────────────────────────────────────────────────────
  // Build a map of text nodes in the visible DOM to enable highlighting.
  // We search the actual page DOM for the paragraph text and create Range objects.
  function buildTextNodeMap() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const nodes = [];
    let offset = 0;
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      nodes.push({ node, start: offset, end: offset + text.length, text });
      offset += text.length;
    }
    return nodes;
  }

  function findRangesForParagraph(paragraphText, textNodeMap) {
    // Find where the paragraph text appears in the concatenated page text
    const fullText = textNodeMap.map((n) => n.text).join("");
    const idx = fullText.indexOf(paragraphText.substring(0, 100));
    if (idx === -1) return null;
    return idx; // offset in concatenated text
  }

  function createRangeForWord(wordStart, wordEnd, textNodeMap) {
    const range = document.createRange();
    let startSet = false;

    for (const entry of textNodeMap) {
      if (!startSet && wordStart < entry.end && wordStart >= entry.start) {
        const localStart = wordStart - entry.start;
        range.setStart(entry.node, Math.min(localStart, entry.text.length));
        startSet = true;
      }
      if (startSet && wordEnd <= entry.end && wordEnd >= entry.start) {
        const localEnd = wordEnd - entry.start;
        range.setEnd(entry.node, Math.min(localEnd, entry.text.length));
        return range;
      }
    }
    return null;
  }

  // ─── Highlighting ──────────────────────────────────────────────────────────
  function clearHighlights() {
    if (wordHighlight) wordHighlight.clear();
    if (sentenceHighlight) sentenceHighlight.clear();
  }

  function highlightWord(timestamps, currentTime, textNodeMap, paragraphOffset) {
    if (!wordHighlight || !textNodeMap || paragraphOffset === null) return;

    wordHighlight.clear();
    sentenceHighlight.clear();

    // Find current word
    let currentWordIdx = -1;
    for (let i = 0; i < timestamps.length; i++) {
      if (currentTime >= timestamps[i].start && currentTime < timestamps[i].end) {
        currentWordIdx = i;
        break;
      }
    }
    if (currentWordIdx === -1) return;

    // Build current word range
    const word = timestamps[currentWordIdx];
    // Calculate character offset of this word in the paragraph text
    let charOffset = 0;
    for (let i = 0; i < currentWordIdx; i++) {
      charOffset += timestamps[i].word.length + 1; // +1 for space
    }
    const wordRange = createRangeForWord(
      paragraphOffset + charOffset,
      paragraphOffset + charOffset + word.word.length,
      textNodeMap
    );
    if (wordRange) {
      wordHighlight.add(wordRange);

      // Auto-scroll
      const rect = wordRange.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        const el = wordRange.startContainer.parentElement;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    // Build sentence range (from last punctuation to next punctuation)
    let sentStart = currentWordIdx;
    let sentEnd = currentWordIdx;
    const punctuation = /[.!?;]/;
    while (sentStart > 0 && !punctuation.test(timestamps[sentStart - 1].word.slice(-1))) {
      sentStart--;
    }
    while (sentEnd < timestamps.length - 1 && !punctuation.test(timestamps[sentEnd].word.slice(-1))) {
      sentEnd++;
    }

    let sentCharStart = 0;
    for (let i = 0; i < sentStart; i++) {
      sentCharStart += timestamps[i].word.length + 1;
    }
    let sentCharEnd = 0;
    for (let i = 0; i <= sentEnd; i++) {
      sentCharEnd += timestamps[i].word.length + (i < sentEnd ? 1 : 0);
    }

    const sentRange = createRangeForWord(
      paragraphOffset + sentCharStart,
      paragraphOffset + sentCharEnd,
      textNodeMap
    );
    if (sentRange) {
      sentenceHighlight.add(sentRange);
    }
  }

  // ─── Animation loop for highlighting ──────────────────────────────────────
  function startHighlightLoop() {
    function tick() {
      if (!state.playing) return;
      highlightWord(
        state.timestamps,
        state._currentTime || 0,
        state.textNodeMap,
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

  async function requestTTSWithTimestamps(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "TTS_REQUEST",
          text,
          voice: state.voice,
          speed: state.speed,
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
  let audioResolve = null;
  let audioReject = null;

  // Listen for audio events relayed from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "AUDIO_TIME" && state.playing) {
      state._currentTime = msg.currentTime;
    }
    if (msg.type === "AUDIO_ENDED") {
      if (audioResolve) { audioResolve(); audioResolve = null; audioReject = null; }
    }
    if (msg.type === "AUDIO_ERROR") {
      if (audioReject) { audioReject(new Error(msg.message || "Audio playback error")); audioResolve = null; audioReject = null; }
    }
  });

  function playAudioFromBase64(base64) {
    return new Promise((resolve, reject) => {
      audioResolve = resolve;
      audioReject = reject;
      chrome.runtime.sendMessage({
        type: "PLAY_AUDIO",
        audio_base64: base64,
        speed: state.speed,
      }, (response) => {
        if (response && !response.ok) {
          audioResolve = null;
          audioReject = null;
          reject(new Error(response.error || "Audio play failed"));
        }
      });
    });
  }

  async function prefetchParagraph(index) {
    if (index >= state.paragraphs.length || state.prefetchCache[index]) return;
    try {
      const data = await requestTTSWithTimestamps(state.paragraphs[index]);
      state.prefetchCache[index] = data;
    } catch (e) {
      // Silently fail prefetch
    }
  }

  async function playParagraphWithServer(index) {
    if (index >= state.paragraphs.length) {
      stopReadAloud();
      return;
    }

    // Cancel any browser TTS that might be running
    speechSynthesis.cancel();
    state.utterance = null;

    state.currentParagraph = index;
    updateToolbarStatus(`Paragraph ${index + 1}/${state.paragraphs.length}`);

    try {
      let data;
      if (state.prefetchCache[index]) {
        data = state.prefetchCache[index];
        delete state.prefetchCache[index];
      } else {
        data = await requestTTSWithTimestamps(state.paragraphs[index]);
      }

      if (!state.active) return;

      state.timestamps = data.timestamps || [];

      // Build text node map and find paragraph offset
      state.textNodeMap = buildTextNodeMap();
      state._paragraphOffset = findRangesForParagraph(
        state.paragraphs[index],
        state.textNodeMap
      );

      state.playing = true;
      startHighlightLoop();

      // Prefetch next paragraphs
      for (let i = 1; i <= 2; i++) {
        prefetchParagraph(index + i);
      }

      await playAudioFromBase64(data.audio_base64);

      stopHighlightLoop();
      clearHighlights();

      if (state.active && state.playing) {
        state.playing = false;
        playParagraphWithServer(index + 1);
      }
    } catch (err) {
      console.error("Read Aloud: TTS playback error", err);
      // Only fall back if the server is actually down, not on transient audio errors
      const serverOk = await checkServerHealth();
      if (!serverOk) {
        updateToolbarStatus(`Server down - falling back to browser TTS`);
        state.useServer = false;
        setTimeout(() => playParagraphWithWebSpeech(index), 1000);
      } else {
        // Transient error, retry the same paragraph
        updateToolbarStatus(`Retrying paragraph ${index + 1}...`);
        setTimeout(() => playParagraphWithServer(index), 500);
      }
    }
  }

  // ─── Web Speech API Fallback ──────────────────────────────────────────────
  function playParagraphWithWebSpeech(index) {
    if (index >= state.paragraphs.length) {
      stopReadAloud();
      return;
    }

    state.currentParagraph = index;
    updateToolbarStatus(`Paragraph ${index + 1}/${state.paragraphs.length} (Browser TTS)`);

    const utterance = new SpeechSynthesisUtterance(state.paragraphs[index]);
    utterance.rate = state.speed;
    state.utterance = utterance;

    // Word boundary highlighting
    state.textNodeMap = buildTextNodeMap();
    state._paragraphOffset = findRangesForParagraph(
      state.paragraphs[index],
      state.textNodeMap
    );

    utterance.onboundary = (event) => {
      if (event.name === "word" && state.textNodeMap && state._paragraphOffset !== null) {
        if (wordHighlight) wordHighlight.clear();
        const charStart = state._paragraphOffset + event.charIndex;
        const charEnd = charStart + event.charLength;
        const range = createRangeForWord(charStart, charEnd, state.textNodeMap);
        if (range) {
          wordHighlight.add(range);
          const rect = range.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            const el = range.startContainer.parentElement;
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
    };

    utterance.onend = () => {
      clearHighlights();
      if (state.active) {
        playParagraphWithWebSpeech(index + 1);
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

  function playCurrentParagraph() {
    if (state.useServer) {
      playParagraphWithServer(state.currentParagraph);
    } else {
      playParagraphWithWebSpeech(state.currentParagraph);
    }
  }

  // ─── Health Check Timer ────────────────────────────────────────────────────
  function startHealthCheckTimer() {
    state.healthCheckTimer = setInterval(async () => {
      if (!state.useServer) {
        const healthy = await checkServerHealth();
        if (healthy) {
          state.useServer = true;
          updateToolbarStatus("Server reconnected - using Kokoro TTS");
        }
      }
    }, 30000);
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

    btnPrev.addEventListener("click", () => {
      if (state.currentParagraph > 0) {
        stopCurrentAudio();
        state.currentParagraph--;
        playCurrentParagraph();
      }
    });

    btnNext.addEventListener("click", () => {
      if (state.currentParagraph < state.paragraphs.length - 1) {
        stopCurrentAudio();
        state.currentParagraph++;
        playCurrentParagraph();
      }
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
    audioResolve = null;
    audioReject = null;
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
    if (audioResolve) {
      state.playing = true;
      chrome.runtime.sendMessage({ type: "RESUME_AUDIO" });
      startHighlightLoop();
    } else if (state.utterance) {
      state.playing = true;
      speechSynthesis.resume();
    } else {
      playCurrentParagraph();
    }
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

    state.paragraphs = splitIntoParagraphs(text);

    if (state.paragraphs.length === 0) {
      updateToolbarStatus("No readable text found");
      setTimeout(stopReadAloud, 3000);
      return;
    }

    updateToolbarStatus(`Found ${state.paragraphs.length} paragraphs. Checking server...`);

    // Check server health
    const serverOk = await checkServerHealth();
    state.useServer = serverOk;

    if (serverOk) {
      updateToolbarStatus("Connected to Kokoro TTS. Starting...");
    } else {
      updateToolbarStatus("Server unavailable. Using browser TTS...");
    }

    state.currentParagraph = 0;
    updatePlayButton(true);
    playCurrentParagraph();
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
    state.paragraphs = [];
    state.timestamps = [];
    state.prefetchCache = {};
    state.textNodeMap = null;
    state._paragraphOffset = null;
    state._currentTime = 0;
  }

  // ─── Message Listener ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "TOGGLE_READ_ALOUD") {
      toggleReadAloud(message.selectedText);
    }
  });
})();
