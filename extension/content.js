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
    // Two different units. Chunks are what gets synthesized and played: one
    // sentence each (000053). Paragraphs are what the reader navigates by.
    chunks: [],            // [{ text, paragraph }]
    paragraphStarts: [],   // chunk index each paragraph begins at
    currentChunk: 0,
    timestamps: [],
    speed: 1.0,
    voice: "af_heart",
    serverUrl: "http://localhost:7860",
    useServer: true,       // false = Web Speech API fallback
    serverHealthy: null,   // last observed health, independent of what is in use
    // Which Kokoro is speaking: "server" or "browser" (000046). "Server" in
    // the names around here means "a Kokoro engine", either one.
    engine: null,
    unavailableReason: null, // why neither engine can speak, from HEALTH_CHECK
    allowBrowserFallback: false,  // opt-in; otherwise we wait for Kokoro
    readCitations: false,  // speak "[7]"-style markers (000047); skipped by default
    readFromSelection: true, // selecting text jumps there (000039); on by default
    userPaused: false,     // the reader pressed pause, as opposed to waiting on audio
    waitingForServer: false,
    toolbar: null,
    utterance: null,       // for Web Speech API fallback
    // The page's sentence record (lib/record.js): each chunk's state and, once
    // made, its audio, kept for the session so going back never re-synthesizes.
    record: null,
    _preloaded: new Set(), // sentence indices handed to the player ahead of time
    // Progress (000040): where each sentence starts in characters, and how
    // many characters per second the made sentences actually take.
    _charStarts: null,
    _totalChars: 0,
    _timed: new Set(),
    _timedChars: 0,
    _timedSeconds: 0,
    _currentDuration: 0,
    healthCheckTimer: null,
    animFrameId: null,
    textIndex: null,       // { text, nodes, offsets } — collapsed page text mapped to the DOM
    _chunkOffsets: {},     // chunk index -> where it was found in textIndex.text
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
    const result = await chrome.storage.local.get([
      "voice",
      "speed",
      "serverUrl",
      "allowBrowserFallback",
      "readCitations",
      "readFromSelection",
    ]);
    // Skipped unless asked for; read once per session, since the chunks are
    // cut from the extraction it shapes.
    state.readCitations = result.readCitations === true;
    state.readFromSelection = result.readFromSelection !== false;
    if (result.voice) state.voice = result.voice;
    if (result.speed) state.speed = result.speed;
    if (result.serverUrl) state.serverUrl = result.serverUrl;
    state.allowBrowserFallback = result.allowBrowserFallback === true;
  }

  // Settings were read once per session, so saving from the popup mid-read did
  // nothing while the popup said "Saved!". Apply them to the session in flight.
  function onSettingsChanged(changes, area) {
    if (area !== "local" || !state.active) return;

    if (changes.serverUrl) {
      state.serverUrl = changes.serverUrl.newValue || state.serverUrl;
    }
    if (changes.readFromSelection) {
      state.readFromSelection = changes.readFromSelection.newValue !== false;
    }
    if (changes.allowBrowserFallback) {
      state.allowBrowserFallback = changes.allowBrowserFallback.newValue === true;
      updateEngineIndicator();
    }
    if (changes.speed && changes.speed.newValue !== state.speed) {
      state.speed = changes.speed.newValue;
      updateSpeedControl(state.speed);
      postMessage({ type: "SET_AUDIO_SPEED", speed: state.speed });
    }
    if (changes.voice && changes.voice.newValue !== state.voice) {
      state.voice = changes.voice.newValue;
      applyNewVoice();
    }
  }

  chrome.storage.onChanged.addListener(onSettingsChanged);

  // Nothing already synthesized can be reused: the record and the player's
  // decoded preload are both in the previous voice.
  function applyNewVoice() {
    const wasPlaying = state.playing;
    const chunk = state.currentChunk;
    stopCurrentAudio();
    state.record?.clear("voice changed");
    scheduleProgressPaint();
    synthesis.generation++;
    state.currentChunk = chunk;
    // A change made while paused should not start it reading.
    if (wasPlaying) playCurrentChunk();
  }

  // ─── Text Extraction ───────────────────────────────────────────────────────
  // The logic below this line lives in lib/textkit.js — paragraph extraction,
  // chunking, the text index and word spans. It is separated because that is
  // where the subtle bugs are, and it is covered by tests/textkit.test.js.
  const {
    extractParagraphs: extractFromPage,
    splitIntoParagraphs,
    buildChunks,
    buildTextIndex,
    findChunkOffset,
    searchStartFor,
    resolveWordSpans,
  } = ReadAloudText;

  // Extraction and the text index must be built with the same options: a
  // marker dropped from one and not the other leaves every chunk after it
  // unmatchable, and its highlighting gone (000047).
  function textOptions() {
    return { skipCitations: !state.readCitations };
  }

  // Read from the live page by our own rules (000058), not from a copy: what
  // is extracted is then exactly what the text index finds.
  function extractParagraphs() {
    const paragraphs = extractFromPage(document, textOptions());
    if (paragraphs.length) return paragraphs;
    // Nothing structured survived the rules: read what the page shows.
    return splitIntoParagraphs(document.body.innerText);
  }

  // Logged with its time and why it was built (000058): a rebuild on every
  // miss would freeze the tab on a large page, and the log has to show it.
  function timedIndex(reason, chunkIndex) {
    const started = performance.now();
    const index = buildTextIndex(document.body, textOptions());
    log("index.build", { reason, chunk: chunkIndex, ms: Math.round(performance.now() - started) });
    return index;
  }

  function findParagraphOffset(paragraphText, chunkIndex) {
    if (!state.textIndex) state.textIndex = timedIndex("first", chunkIndex);

    // Search forward from the nearest chunk already located, so a phrase that
    // appears more than once on the page resolves to the copy being read
    // rather than the first one in the document.
    const from = searchStartFor(state._chunkOffsets, chunkIndex);
    let idx = findChunkOffset(state.textIndex.text, paragraphText, from);

    if (idx === -1) {
      // The page may have changed since the index was built — lazy-loaded
      // images, expanding sections, ads settling. Rebuild once before giving up.
      // Every remembered offset pointed into the old index, so they go with it,
      // and this search starts from the beginning rather than a stale hint.
      state.textIndex = timedIndex("miss", chunkIndex);
      state._chunkOffsets = {};
      state._sentenceStarts = null;
      idx = findChunkOffset(state.textIndex.text, paragraphText, 0);
    }
    if (idx === -1) {
      // The page may have changed inside the paragraph since it was read (an
      // edited comment, a live counter). A prefix match still anchors it.
      const probe = paragraphText.slice(0, 60);
      if (probe.length >= 20) {
        idx = findChunkOffset(state.textIndex.text, probe, from);
      }
    }
    if (idx === -1) {
      console.warn(
        "Read Aloud: paragraph not found in page DOM, highlighting disabled for it:",
        paragraphText.slice(0, 60)
      );
      return null;
    }

    // Remembered so the chunks after this one, and a later jump back to it,
    // start their search from the right place.
    state._chunkOffsets[chunkIndex] = idx;
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
      paintPlayed();
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

  // ─── Messaging ────────────────────────────────────────────────────────────
  // Reloading the extension invalidates this script's chrome.* bridge but does
  // not stop the script. Every send then throws "Extension context invalidated"
  // — synchronously, inside a promise executor, so it surfaces as an unhandled
  // rejection on every health-check tick for as long as the tab stays open.
  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // Resolves null instead of throwing when there is nothing to talk to.
  function sendMessage(message) {
    return new Promise((resolve) => {
      if (!extensionAlive()) {
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // Read it, or Chrome logs it as an unchecked error.
          void chrome.runtime.lastError;
          resolve(response ?? null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Fire-and-forget for the playback controls, where there is nothing useful to
  // do with a failure.
  function postMessage(message) {
    sendMessage(message);
  }

  // Debug log (000052): events go to the background's log, which the popup
  // downloads. Text appears only as a short preview, never whole.
  function log(ev, details = {}) {
    postMessage({ type: "LOG", src: "tab", ev, ...details });
  }

  function preview(text) {
    const t = (text || "").trim();
    return t.length > 40 ? `${t.slice(0, 40)}…` : t;
  }

  // An orphan cannot do anything useful and would otherwise keep its timers
  // firing and — worse — keep speaking. Go quiet and leave the page clean.
  function selfDestruct() {
    console.warn("Read Aloud: extension was reloaded, stopping this copy");
    stopHealthCheckTimer();
    stopHighlightLoop();
    try {
      chrome.storage.onChanged.removeListener(onSettingsChanged);
    } catch (e) {
      /* bridge is already gone */
    }
    try {
      speechSynthesis.cancel();
    } catch (e) {
      /* page may be unloading */
    }
    clearHighlights();
    removeToolbar();
    state.active = false;
    state.playing = false;
    state.utterance = null;
  }

  // ─── Server Communication (via background service worker) ────────────────
  // True when some Kokoro engine can speak: the server, or the browser engine.
  // The background decides which, by the engine setting (000046).
  async function checkServerHealth() {
    const response = await sendMessage({
      type: "HEALTH_CHECK",
      serverUrl: state.serverUrl,
    });
    if (response?.engine) state.engine = response.engine;
    state.engineSetting = response?.setting || state.engineSetting;
    state.unavailableReason = response?.ok ? null : response?.reason || null;
    return Boolean(response && response.ok);
  }

  // Audio is always synthesized at 1.0x and sped up at playback time via
  // audio.playbackRate. Doing it server-side too would compound the two rates,
  // and would bake a speed into every prefetched paragraph.
  async function requestTTSWithTimestamps(text, index) {
    if (!extensionAlive()) throw new Error("Extension context invalidated");
    const started = Date.now();
    log("chunk.request", { chunk: index, chars: text.length, text: preview(text) });
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
            log("chunk.fail", { chunk: index, error: chrome.runtime.lastError.message });
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.ok) {
            log("chunk.ready", { chunk: index, engine: response.engine, ms: Date.now() - started });
            if (response.engine && response.engine !== state.engine) {
              log("engine.switch", { from: state.engine, to: response.engine });
              state.engine = response.engine;
              updateEngineIndicator();
            }
            resolve(response.data);
          } else {
            log("chunk.fail", { chunk: index, error: response?.error || "no response" });
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

  // Firefox plays the audio in its background page, and suspends that page
  // after ~30s without an incoming event; the player's AUDIO_TIME traffic is
  // outgoing, so it does not count. A 500-character chunk runs ~35s at 1x, with
  // no message from here between its PLAY and the next one, so it could be cut
  // off near the end. A ping well inside the window keeps the page alive for
  // exactly as long as audio is moving. In Chrome it is a no-op the service
  // worker ignores.
  const KEEPALIVE_MS = 20000;
  let lastKeepalive = 0;

  // Listen for audio events relayed from background
  function onAudioMessage(msg) {
    // A keyed event about another sentence is stale: the player moved on by
    // itself (000059) and the tab has not caught up, or a jump overtook it.
    const otherSentence = msg.key != null && msg.key !== state.currentChunk;
    if (msg.type === "AUDIO_TIME" && state.playing && !otherSentence) {
      state._currentTime = msg.currentTime;
      const now = Date.now();
      if (now - lastKeepalive > KEEPALIVE_MS) {
        lastKeepalive = now;
        postMessage({ type: "KEEPALIVE" });
      }
    }
    if (msg.type === "AUDIO_ENDED" && !otherSentence) {
      // advancedTo: the player has already started the next sentence.
      finishAudio(msg.advancedTo != null ? { advancedTo: msg.advancedTo } : "ended");
    }
    if (msg.type === "AUDIO_ERROR") {
      failAudio(new Error(msg.message || "Audio playback error"));
    }
    // The browser engine downloads ~310MB the first time and compiles its GPU
    // shaders on every load. Both take long enough to look like a hang, so
    // say what is happening in place of "synthesizing...".
    if (msg.type === "ENGINE_PROGRESS" && state.active) {
      // Only the browser engine reports progress, so this settles which engine
      // is running. Without it, switching the popup to this browser left the
      // label on the engine the last health check saw, and the model download
      // ran under "Kokoro · server" (000051).
      if (state.engine !== "browser") {
        state.engine = "browser";
        updateEngineIndicator();
      }
      const status = {
        download: `Downloading the voice model, one time only: ${msg.percent}%`,
        load: "Loading the voice model...",
      };
      updateToolbarStatus(status[msg.phase] || "Preparing the voice model...");
    }
  }

  chrome.runtime.onMessage.addListener(onAudioMessage);

  function playAudioFromBase64(base64, key) {
    return new Promise((resolve, reject) => {
      audioResolve = resolve;
      audioReject = reject;

      const send = (withAudio) =>
        sendMessage({
          type: "PLAY_AUDIO",
          key,
          audio_base64: withAudio ? base64 : undefined,
          speed: state.speed,
        });

      const handle = (response) => {
        if (!response) {
          failAudio(new Error("Could not reach the extension"));
        } else if (!response.ok) {
          failAudio(new Error(response.error || "Audio play failed"));
        } else {
          state._preloaded.delete(key);
          // Only now: a PLAY drops the player's preloads that do not lie just
          // ahead of it, so ones sent before it could be thrown away (000053,
          // seen as preloaded=false on every audio.play in the debug log).
          preloadAhead();
        }
      };

      // Ask the player to use what it already decoded. Shipping ~1.8MB of
      // base64 through two message hops is most of the gap at a chunk
      // boundary, so only do it when the player says it has nothing.
      send(!state._preloaded.has(key)).then((response) => {
        if (response?.needAudio) {
          state._preloaded.delete(key);
          send(true).then(handle);
          return;
        }
        handle(response);
      });
    });
  }

  // ─── Synthesis: the whole page, one sentence at a time (000053) ──────────
  // The record says which sentence is next: forward from the reader, then the
  // gaps a jump left behind. One request at a time, so after a jump the
  // target waits behind at most the one sentence already in flight, never a
  // queue of stale work.
  //
  // A failure stalls the loop rather than retrying at once, or a server that
  // is down would be asked again in a tight loop. Playing a sentence kicks it
  // again, and so does the retry or recovery path that plays one.
  const synthesis = {
    inFlight: null,   // index being synthesized
    stalled: false,
    generation: 0,    // bumped when what is made would be unusable
  };

  // The audio kept for one page, as base64. ~64MB is about 17 minutes of
  // speech; past it, sentences the reader has passed are dropped oldest first.
  const RECORD_CAP_BYTES = 64 * 2 ** 20;

  function pumpSynthesis({ kick = false } = {}) {
    if (kick) synthesis.stalled = false;
    const record = state.record;
    if (!state.active || !record || synthesis.inFlight != null || synthesis.stalled) return;
    // Browser speech reads the text itself; there is nothing to make.
    if (!state.useServer) return;

    const index = record.next();
    if (index === -1) return;
    synthesis.inFlight = index;
    record.start(index);
    const generation = synthesis.generation;

    requestTTSWithTimestamps(state.chunks[index].text, index)
      .then(
        (data) => {
          if (generation !== synthesis.generation || state.record !== record) return;
          const dropped = record.store(index, data);
          noteDuration(index, data);
          scheduleProgressPaint();
          if (dropped.length) log("record.drop", { sentences: dropped.length, kept: record.usedBytes });
          preloadAhead();
        },
        (error) => {
          if (generation !== synthesis.generation || state.record !== record) return;
          record.fail(index, error);
          // Stall only when that is safe. If the reader is waiting on some
          // other sentence (a jump landed while this one was in flight), it
          // has to be asked for, or the reader waits forever. Its own failure
          // then reaches playback, which retries or waits for the server.
          const reader = record.cursor;
          synthesis.stalled = index === reader || record.has(reader);
        }
      )
      .finally(() => {
        // A request from a cleared record still held the one slot until now.
        if (synthesis.inFlight === index) synthesis.inFlight = null;
        pumpSynthesis();
      });
  }

  // Hand the sentences just ahead to the player so it can decode them while
  // this one plays, and start each next one itself when this one ends
  // (000059). Several, not one: a hidden tab can be held back for longer than
  // a sentence lasts, and the player must not run dry while it is.
  const PRELOAD_AHEAD = 6;

  function preloadAhead() {
    const record = state.record;
    if (!record) return;
    const here = state.currentChunk;
    for (const key of state._preloaded) if (key <= here) state._preloaded.delete(key);
    for (let i = here + 1; i <= here + PRELOAD_AHEAD && i < state.chunks.length; i++) {
      if (state._preloaded.has(i)) continue;
      const data = record.get(i);
      if (!data) break; // in order: the player can only advance into the next one
      state._preloaded.add(i);
      postMessage({ type: "PRELOAD_AUDIO", key: i, audio_base64: data.audio_base64 });
    }
  }

  // Bumped by every start and stop, so a call still waiting on its sentence
  // knows it has been overtaken by a jump, a stop or a voice change.
  let playToken = 0;

  // `started`: the player already began this sentence on its own when the
  // one before ended (000059); set up for it, but send no PLAY. `paused`: the
  // reader paused just as that happened, so stay paused on it.
  async function playChunkWithServer(index, { started = false, paused = false } = {}) {
    if (index >= state.chunks.length) {
      stopReadAloud();
      return;
    }

    // Cancel any browser TTS that might be running
    speechSynthesis.cancel();
    state.utterance = null;

    state.currentChunk = index;
    const token = ++playToken;
    const label = `Paragraph ${currentParagraph() + 1}/${paragraphCount()}`;

    try {
      const record = state.record;
      record.setCursor(index);
      if (!record.has(index)) {
        // Say so while waiting. A cold server has to load the model before it
        // can synthesize anything, and jumping straight to the paragraph label
        // makes that look like a hang.
        updateToolbarStatus(`${label} — synthesizing...`);
      }
      pumpSynthesis({ kick: true });
      const data = await record.whenReady(index);
      if (token !== playToken || !state.active) return;
      noteDuration(index, data);
      state._currentDuration = durationOf(data);
      updateToolbarStatus(statusLabel());

      state.timestamps = resolveWordSpans(data.timestamps || []);
      state._paragraphOffset = findParagraphOffset(state.chunks[index].text, index);
      lastHighlightedWord = -1;
      // The previous chunk's time is still here when it ended by itself (only
      // Stop/Prev/Next reset it). Left alone, the highlight loop would read
      // the new timestamps at the old chunk's end time and light a word
      // seconds into this chunk until the first AUDIO_TIME corrected it (000048).
      state._currentTime = 0;
      // Kept so playback can be rebuilt if Chrome discards the offscreen
      // document during a pause — see resumePlayback.
      state._audioBase64 = data.audio_base64;

      // Audio is on its way, so whatever hold we were in is over. Covers the
      // request succeeding on a path that did not go through retryServerNow.
      if (state.waitingForServer) {
        state.waitingForServer = false;
        state.serverHealthy = true;
        updatePlayButton(true);
        updateEngineIndicator();
      }

      state.playing = !paused;
      if (state.playing) startHighlightLoop();
      paintProgress();

      // The next sentences are preloaded once the player has started this one
      // (see playAudioFromBase64), or by synthesis the moment each is stored.
      let outcome;
      if (started) {
        state._preloaded.delete(index);
        preloadAhead();
        outcome = await new Promise((resolve, reject) => {
          audioResolve = resolve;
          audioReject = reject;
        });
      } else {
        outcome = await playAudioFromBase64(data.audio_base64, index);
      }
      const advancedTo = outcome?.advancedTo;
      log("chunk.played", { chunk: index, outcome: advancedTo != null ? "advanced" : outcome });

      // Stop/prev/next already tore down the highlight state and may have
      // started somewhere else — leave it alone.
      if (outcome === "cancelled" || token !== playToken) return;
      record.markPlayed(index);

      stopHighlightLoop();
      clearHighlights();

      if (!state.active) return;
      if (advancedTo === index + 1) {
        // The audio is already moving; catch up with it, paused or not.
        const wasPlaying = state.playing;
        state.playing = false;
        playChunkWithServer(index + 1, { started: true, paused: !wasPlaying });
      } else if (state.playing) {
        state.playing = false;
        playChunkWithServer(index + 1);
      }
    } catch (err) {
      // Overtaken while waiting: a jump, a stop or a voice change. Whoever
      // overtook it is in charge now.
      if (token !== playToken || !state.active) return;
      console.error("Read Aloud: TTS playback error", err);
      log("chunk.error", {
        chunk: index,
        at: Math.round((state._currentTime || 0) * 100) / 100,
        error: err?.message || String(err),
      });
      // Only fall back if the server is actually down, not on transient audio errors
      const serverOk = await checkServerHealth();
      if (!state.active) return;
      state.serverHealthy = serverOk;
      if (!serverOk) {
        if (!state.allowBrowserFallback) {
          // Reading in a voice the user did not ask for is worse than not
          // reading. Hold here; the health poll picks it up when it returns.
          log("wait.server", { chunk: index, reason: state.unavailableReason || undefined });
          waitForServer(index);
          return;
        }
        log("fallback.webspeech", { chunk: index });
        state.useServer = false;
        updateEngineIndicator();
        // Re-check on the way in: stopping during the delay must not restart it.
        setTimeout(() => state.active && playChunkWithWebSpeech(index), 1000);
      } else {
        log("chunk.retry", { chunk: index });
        updateToolbarStatus(`Retrying paragraph ${currentParagraph() + 1}...`);
        setTimeout(() => state.active && playChunkWithServer(index), 500);
      }
    }
  }

  // ─── Waiting for the server ───────────────────────────────────────────────
  // Reached when the server is unreachable and browser fallback is off. The
  // toolbar is open because the reader wants to read, and the likeliest reason
  // the server is down is that it has not been started yet — so hold position
  // and resume rather than tearing down. Stop is still right there.
  function waitForServer(chunkIndex) {
    state.currentChunk = chunkIndex;
    state.playing = false;
    state.waitingForServer = true;
    state.useServer = true; // still the intent, just not reachable
    stopHighlightLoop();
    clearHighlights();
    updatePlayButton(false);
    updateToolbarStatus(
      state.engine === "browser" && state.unavailableReason
        ? `Can't read here: ${state.unavailableReason}`
        : `Waiting for the Kokoro server at ${state.serverUrl}`
    );
    updateEngineIndicator();
  }

  async function retryServerNow() {
    updateToolbarStatus("Checking the Kokoro server...");
    const healthy = await checkServerHealth();
    if (!state.active) return;
    state.serverHealthy = healthy;
    if (!healthy) {
      waitForServer(state.currentChunk);
      return;
    }
    state.waitingForServer = false;
    updatePlayButton(true);
    updateEngineIndicator();
    playCurrentChunk();
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
    state._paragraphOffset = findParagraphOffset(chunkText, index);

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
      // Stop at the chunk boundary rather than waiting up to a poll interval
      // for the health timer to notice — this one is audible.
      if (!extensionAlive()) {
        selfDestruct();
        return;
      }
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
    // Browser speech only ever runs when it has been opted into — a stale
    // useServer=false must not become a silent voice swap.
    if (!state.useServer && state.allowBrowserFallback) {
      playChunkWithWebSpeech(state.currentChunk);
    } else {
      playChunkWithServer(state.currentChunk);
    }
  }

  // ─── Health Check Timer ────────────────────────────────────────────────────
  // Polls in both directions. Previously it only ran while already fallen back,
  // so a server that died mid-article went unreported until the next chunk
  // failed — the toolbar kept claiming Kokoro while nothing was wrong yet.
  function startHealthCheckTimer() {
    startStallWatch();
    state.healthCheckTimer = setInterval(async () => {
      // This interval is what kept an orphaned copy alive, throwing on every
      // tick for as long as the tab stayed open. Nothing else notices, because
      // the teardown handshake only runs when a replacement is injected.
      if (!extensionAlive()) {
        selfDestruct();
        return;
      }
      const healthy = await checkServerHealth();
      if (!state.active || healthy === state.serverHealthy) return;
      log("health.change", { ok: healthy, engine: state.engine, reason: state.unavailableReason || undefined });
      state.serverHealthy = healthy;

      // Held waiting because fallback is off — pick up from the chunk that
      // failed, which is usually the moment the user finally started the server.
      if (healthy && state.waitingForServer) {
        state.waitingForServer = false;
        updatePlayButton(true);
        updateEngineIndicator();
        playCurrentChunk();
        return;
      }

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

  // A tick that arrives seconds late means this tab's thread was busy, or the
  // browser held its timers back because the tab was hidden. Either one stops
  // reading for that long, so it goes in the debug log with which it was
  // (000058: one 6.3s silence on Hacker News that the log could not explain).
  const STALL_TICK_MS = 500;
  const STALL_LOG_MS = 2000;
  let stallTimer = null;

  function startStallWatch() {
    clearInterval(stallTimer);
    let last = performance.now();
    stallTimer = setInterval(() => {
      const now = performance.now();
      const late = now - last - STALL_TICK_MS;
      last = now;
      if (late > STALL_LOG_MS && state.active) {
        log("tab.stall", { ms: Math.round(late), hidden: document.hidden, chunk: state.currentChunk });
      }
    }, STALL_TICK_MS);
  }

  function stopHealthCheckTimer() {
    clearInterval(stallTimer);
    stallTimer = null;
    if (state.healthCheckTimer) {
      clearInterval(state.healthCheckTimer);
      state.healthCheckTimer = null;
    }
  }

  // ─── Progress through the page (000040) ───────────────────────────────────
  // Position is measured in characters, which track speaking time far better
  // than a count of sentences or paragraphs: thirty short comments and thirty
  // long ones are very different listens.

  function charStarts() {
    if (!state._charStarts) {
      let total = 0;
      state._charStarts = state.chunks.map((chunk) => {
        const at = total;
        total += chunk.text.length;
        return at;
      });
      state._totalChars = total;
    }
    return state._charStarts;
  }

  // How long a sentence lasts at 1x: its last word's end when the engine
  // timed words, else the length of its 16-bit mono WAV.
  function durationOf(data) {
    const last = data?.timestamps?.at?.(-1);
    if (last && last.end > 0) return last.end;
    const bytes = ((data?.audio_base64?.length || 0) * 3) / 4 - 44;
    return bytes > 0 ? bytes / 2 / (data.sample_rate || 24000) : 0;
  }

  // Characters per second of speech, from every sentence made so far, so the
  // estimate improves as synthesis goes on.
  function noteDuration(index, data) {
    const seconds = durationOf(data);
    if (!(seconds > 0) || state._timed.has(index)) return;
    state._timed.add(index);
    state._timedChars += state.chunks[index].text.length;
    state._timedSeconds += seconds;
  }

  function playedChars() {
    const starts = charStarts();
    const index = Math.min(state.currentChunk, state.chunks.length - 1);
    if (index < 0) return 0;
    const length = state.chunks[index].text.length;
    const duration = state._currentDuration || 0;
    const within = duration > 0 ? Math.min(1, (state._currentTime || 0) / duration) : 0;
    return starts[index] + length * within;
  }

  function formatTimeLeft(seconds) {
    if (seconds < 60) return "under a minute left";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min left`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min left`;
  }

  function timeLeft() {
    charStarts(); // also sets _totalChars, which nothing may have asked for yet
    if (!state._timedSeconds || !state._totalChars) return null;
    const perSecond = state._timedChars / state._timedSeconds;
    const remaining = Math.max(0, state._totalChars - playedChars());
    return remaining / perSecond / (state.speed || 1);
  }

  function statusLabel() {
    const where = `Paragraph ${currentParagraph() + 1}/${paragraphCount()}`;
    const left = timeLeft();
    return left == null ? where : `${where} · ${formatTimeLeft(left)}`;
  }

  // The played part follows the audio every frame; the synthesized shade only
  // changes when the record does, so it is repainted on a short delay.
  function paintPlayed() {
    const played = state._shadow?.getElementById("progress-played");
    if (!played || !state.chunks.length) return;
    charStarts();
    const fraction = state._totalChars ? playedChars() / state._totalChars : 0;
    played.style.width = `${(fraction * 100).toFixed(2)}%`;
  }

  function paintProgress() {
    const bar = state._shadow?.getElementById("progress");
    const record = state.record;
    if (!bar || !record || !state.chunks.length) return;
    const starts = charStarts();
    const total = state._totalChars || 1;
    const BASE = "#313244";
    const MADE = "#585b70";
    const stops = [];
    for (let i = 0; i < state.chunks.length; ) {
      if (!record.has(i)) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < state.chunks.length && record.has(j + 1)) j++;
      const from = ((starts[i] / total) * 100).toFixed(2);
      const to = (((starts[j] + state.chunks[j].text.length) / total) * 100).toFixed(2);
      stops.push(`${BASE} ${from}%`, `${MADE} ${from}%`, `${MADE} ${to}%`, `${BASE} ${to}%`);
      i = j + 1;
    }
    bar.style.background = stops.length ? `linear-gradient(to right, ${stops.join(", ")})` : BASE;
    bar.setAttribute("aria-valuemax", String(paragraphCount()));
    bar.setAttribute("aria-valuenow", String(currentParagraph() + 1));
    bar.setAttribute("aria-valuetext", statusLabel());
    paintPlayed();
  }

  let progressTimer = null;

  function scheduleProgressPaint() {
    if (progressTimer) return;
    progressTimer = setTimeout(() => {
      progressTimer = null;
      paintProgress();
    }, 250);
  }

  // The paragraph whose start is nearest to a point along the bar: snapping
  // to paragraphs, the unit Prev and Next already move by.
  function paragraphAtFraction(fraction) {
    const starts = charStarts();
    const target = Math.max(0, Math.min(1, fraction)) * (state._totalChars || 0);
    let best = 0;
    state.paragraphStarts.forEach((chunk, p) => {
      if (Math.abs(starts[chunk] - target) < Math.abs(starts[state.paragraphStarts[best]] - target)) best = p;
    });
    return best;
  }

  function jumpToParagraphStart(paragraph) {
    const p = Math.max(0, Math.min(paragraph, paragraphCount() - 1));
    log("jump.progress", { paragraph: p, from: currentParagraph() });
    jumpToSentence(state.paragraphStarts[p]);
    paintProgress();
  }

  // Click or drag to jump; while dragging the status line shows where a
  // release would land. Arrow keys move a paragraph, Home and End go to the
  // ends, so the bar works without a mouse too.
  function wireProgress(bar) {
    if (!bar) return;
    let dragging = false;
    const fractionAt = (event) => {
      const rect = bar.getBoundingClientRect();
      return rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    };
    bar.addEventListener("pointerdown", (event) => {
      dragging = true;
      bar.classList.add("dragging");
      bar.setPointerCapture?.(event.pointerId);
      updateToolbarStatus(`Paragraph ${paragraphAtFraction(fractionAt(event)) + 1}/${paragraphCount()}`);
    });
    bar.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      updateToolbarStatus(`Paragraph ${paragraphAtFraction(fractionAt(event)) + 1}/${paragraphCount()}`);
    });
    const finish = (event, jump) => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove("dragging");
      if (jump) jumpToParagraphStart(paragraphAtFraction(fractionAt(event)));
      else updateToolbarStatus(statusLabel());
    };
    bar.addEventListener("pointerup", (event) => finish(event, true));
    bar.addEventListener("pointercancel", (event) => finish(event, false));
    bar.addEventListener("keydown", (event) => {
      const here = currentParagraph();
      const to = {
        ArrowRight: here + 1,
        ArrowUp: here + 1,
        ArrowLeft: here - 1,
        ArrowDown: here - 1,
        Home: 0,
        End: paragraphCount() - 1,
      }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      if (to >= 0 && to < paragraphCount() && to !== here) jumpToParagraphStart(to);
    });
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
        .engine.down::before { background: #f38ba8; }
        /* Position through the page (000040): played in the accent colour,
           synthesized but not yet played in a lighter shade (painted as a
           gradient from the sentence record), the rest dark. A strip along
           the bottom edge, so the controls row keeps its width. */
        .progress {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 4px;
          background: #313244;
          cursor: pointer;
          transition: height 0.1s;
        }
        .progress:hover, .progress.dragging, .progress:focus-visible { height: 8px; }
        .progress:focus-visible { outline: 2px solid #89b4fa; outline-offset: -2px; }
        .played {
          width: 0;
          height: 100%;
          background: #89b4fa;
          pointer-events: none;
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
        <span class="engine" id="engine">Connecting</span>
        <button class="close-btn" id="btn-close" title="Close">&times;</button>
        <div class="progress" id="progress" role="slider" tabindex="0"
             aria-label="Position in the page" aria-valuemin="1"
             title="Drag or click to jump to a paragraph"><div class="played" id="progress-played"></div></div>
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
    wireProgress(shadow.getElementById("progress"));

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
      postMessage({ type: "SET_AUDIO_SPEED", speed: val });
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

  // Keeps the toolbar honest when speed is changed from the popup instead.
  function updateSpeedControl(value) {
    if (!state._shadow) return;
    const slider = state._shadow.getElementById("speed-slider");
    const label = state._shadow.getElementById("speed-label");
    if (slider) slider.value = value;
    if (label) label.textContent = `${Number(value).toFixed(1)}x`;
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
    if (state.waitingForServer && state.engine === "browser") {
      // Neither engine can speak: no server, and this browser cannot run the
      // in-browser one. Waiting is still right — the server may be started.
      label = "No engine";
      cls = "engine down";
      title =
        `Can't read in this browser (${state.unavailableReason || "unknown reason"}). ` +
        `Start the Kokoro server at ${state.serverUrl}, or enable browser speech in the popup.`;
    } else if (state.waitingForServer) {
      label = "Server down";
      cls = "engine down";
      title =
        `Waiting for the Kokoro server at ${state.serverUrl}. ` +
        "Enable browser fallback in the extension popup to read without it.";
    } else if (!state.useServer) {
      label = "Browser TTS";
      cls = "engine fallback";
      title = "Kokoro server unavailable — using the browser's built-in speech";
    } else if (state.serverHealthy === false) {
      // Reached while buffered chunks are still playing — the poll notices the
      // server before the prefetch runs out. What happens when it does depends
      // on the fallback setting, so say which.
      label = "Reconnecting";
      cls = "engine warn";
      title = state.allowBrowserFallback
        ? "Kokoro server is not responding; will switch to browser speech if it stays down"
        : "Kokoro server is not responding; playing already-fetched audio until it returns";
    } else if (state.serverHealthy === null) {
      label = "Connecting";
      cls = "engine";
      title = "Checking the Kokoro TTS server";
    } else if (state.engine === "browser") {
      label = "Kokoro · browser";
      cls = "engine ok";
      title =
        "Kokoro running in this browser on the GPU. Sentences are highlighted exactly; " +
        "word positions within a sentence are estimated. Start the local server for exact words.";
    } else {
      label = "Kokoro · server";
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
    playToken++;
    stopHighlightLoop();
    clearHighlights();
    state.playing = false;
    state._currentTime = 0;
    // STOP drops the preload too, so the key must not survive it.
    state._preloaded.clear();
    postMessage({ type: "STOP_AUDIO" });
    // Settle rather than drop it — a pending promise here would strand the
    // paragraph that is awaiting it.
    finishAudio("cancelled");
    if (state.utterance) {
      speechSynthesis.cancel();
      state.utterance = null;
    }
  }

  function pausePlayback() {
    state.userPaused = true;
    log("pause", { chunk: state.currentChunk, at: Math.round((state._currentTime || 0) * 100) / 100 });
    state.playing = false;
    // Paused while its sentence was still being made: it must not start when
    // the audio arrives. Play starts it over, from the record.
    if (!audioResolve) playToken++;
    stopHighlightLoop();
    postMessage({ type: "PAUSE_AUDIO" });
    if (state.utterance) {
      speechSynthesis.pause();
    }
  }

  function resumePlayback() {
    state.userPaused = false;
    // Pressing Play while held is an explicit "try again now" — don't make the
    // user wait out the poll interval.
    if (state.waitingForServer) {
      retryServerNow();
      return;
    }
    if (state.utterance) {
      state.playing = true;
      speechSynthesis.resume();
      return;
    }
    if (!audioResolve) {
      // Nothing is mid-play, so this starts the sentence over, from the record
      // when it is there and synthesizing it otherwise.
      log("resume.restart", { chunk: state.currentChunk });
      playCurrentChunk();
      return;
    }

    state.playing = true;
    // Force the next tick to repaint. highlightWord skips work when the current
    // word has not changed, and after a pause that check would suppress the
    // first frame — leaving whatever was on screen before the pause.
    lastHighlightedWord = -1;
    sendMessage({ type: "RESUME_AUDIO" }).then((response) => {
      log("resume", { chunk: state.currentChunk, resumed: Boolean(response?.resumed), reason: response?.reason });
      if (!response?.resumed) {
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
    // Always carries the audio: any preload belongs to the next chunk, not
    // this one, and the document may have just been rebuilt anyway.
    sendMessage({
      type: "PLAY_AUDIO",
      key: state.currentChunk,
      audio_base64: state._audioBase64,
      speed: state.speed,
      startAt: state._currentTime || 0,
    }).then((response) => {
      if (!response) {
        failAudio(new Error("Could not reach the extension"));
      } else if (!response.ok) {
        failAudio(new Error(response.error || "Audio replay failed"));
      } else {
        // The promise from the original play is still pending and will settle
        // on AUDIO_ENDED as usual, so nothing else needs rewiring.
        startHighlightLoop();
      }
    });
  }

  // ─── Main Toggle ──────────────────────────────────────────────────────────
  async function toggleReadAloud(selectedText) {
    if (state.active) {
      stopReadAloud();
      return;
    }

    await loadSettings();
    state.active = true;
    state.userPaused = false;
    state._charStarts = null;
    state._totalChars = 0;
    state._timed = new Set();
    state._timedChars = 0;
    state._timedSeconds = 0;
    state._currentDuration = 0;
    state._chunkOffsets = {};
    state._sentenceStarts = null;

    createToolbar();
    updateToolbarStatus("Extracting text...");

    // A selection is plain text with no structure to read; the page has both.
    const extractStarted = performance.now();
    const paragraphs = selectedText
      ? splitIntoParagraphs(selectedText)
      : extractParagraphs();
    const built = buildChunks(paragraphs);
    state.chunks = built.chunks;
    state.paragraphStarts = built.paragraphStarts;
    state.record = ReadAloudRecord.create(state.chunks.length, { capBytes: RECORD_CAP_BYTES });

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
    state.currentChunk = 0;
    // The host only: enough to tell sessions apart, without the page's path.
    log("read.start", {
      host: location.hostname,
      paragraphs: paragraphCount(),
      chunks: state.chunks.length,
      extractMs: Math.round(performance.now() - extractStarted),
      engine: state.engine,
      ok: serverOk,
      speed: state.speed,
      voice: state.voice,
    });

    if (!serverOk && !state.allowBrowserFallback) {
      // Start the poll before waiting, or nothing would ever notice recovery.
      startHealthCheckTimer();
      waitForServer(0);
      return;
    }

    state.useServer = serverOk;
    updateEngineIndicator();
    updatePlayButton(true);
    playCurrentChunk();
    startHealthCheckTimer();
  }

  function stopReadAloud() {
    if (state.active) {
      log("read.stop", { chunk: state.currentChunk, of: state.chunks.length, ...state.record?.summary() });
    }
    stopCurrentAudio();
    stopHighlightLoop();
    stopHealthCheckTimer();
    clearHighlights();
    removeToolbar();
    postMessage({ type: "STOP_AUDIO" });
    state.active = false;
    state.playing = false;
    state.waitingForServer = false;
    state.userPaused = false;
    state._sentenceStarts = null;
    clearTimeout(progressTimer);
    progressTimer = null;
    state._charStarts = null;
    state._totalChars = 0;
    state._timed = new Set();
    state._timedChars = 0;
    state._timedSeconds = 0;
    state._currentDuration = 0;
    state.chunks = [];
    state.paragraphStarts = [];
    state.currentChunk = 0;
    state.timestamps = [];
    // Waiters on the old record are rejected, and a request still in flight
    // finds a different generation when it lands and is dropped.
    state.record?.clear("stopped");
    state.record = null;
    synthesis.generation++;
    synthesis.stalled = false;
    state.textIndex = null;
    state._chunkOffsets = {};
    state._paragraphOffset = null;
    state._currentTime = 0;
    state._audioBase64 = null;
    state._preloaded.clear();
  }

  // ─── Message Listener ─────────────────────────────────────────────────────
  function onToggleMessage(message) {
    if (message.type === "TOGGLE_READ_ALOUD") {
      toggleReadAloud(message.selectedText);
    }
  }

  chrome.runtime.onMessage.addListener(onToggleMessage);

  // Leaving the page (a reload, a link, the back button) stops reading here.
  // The audio plays in another context that outlives this page, so without
  // this it finished its sentence after the page was gone (000056). pagehide
  // fires for all of those, and for a page going into the back-forward cache,
  // but not for a #fragment jump within the page (Hacker News's "parent").
  function onPageHide() {
    if (!state.active) return;
    log("page.leave", { chunk: state.currentChunk });
    stopReadAloud();
  }

  window.addEventListener("pagehide", onPageHide);

  // ─── Read from the selected text (000039) ─────────────────────────────────
  // Selecting text in what is being read jumps to the sentence where the
  // selection starts: at once while playing, and staying paused while paused
  // (Umut, 2026-11-23). Acted on once the selection settles, so dragging
  // across a paragraph jumps once. A selection that does not start inside a
  // read sentence (a menu, a form, the page's chrome) is left alone.
  const SELECTION_SETTLE_MS = 350;
  let selectionTimer = null;
  let lastJumpedFrom = null; // the selection start already acted on

  function onSelectionChange() {
    if (!state.active || !state.readFromSelection) return;
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(jumpToSelection, SELECTION_SETTLE_MS);
  }

  // Where each sentence starts in the text index, found in reading order the
  // way highlighting finds them. Built on first use and kept for the session.
  function sentenceStarts() {
    if (state._sentenceStarts) return state._sentenceStarts;
    if (!state.textIndex) state.textIndex = timedIndex("first", state.currentChunk);
    const text = state.textIndex.text;
    let from = 0;
    state._sentenceStarts = state.chunks.map((chunk) => {
      const at = findChunkOffset(text, chunk.text, from);
      if (at !== -1) from = at;
      return at;
    });
    return state._sentenceStarts;
  }

  function sentenceAt(position) {
    if (position < 0) return -1;
    const starts = sentenceStarts();
    for (let i = starts.length - 1; i >= 0; i--) {
      const at = starts[i];
      if (at === -1 || at > position) continue;
      return position < at + state.chunks[i].text.length ? i : -1;
    }
    return -1;
  }

  function jumpToSelection() {
    if (!state.active || !state.readFromSelection) return;
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      lastJumpedFrom = null;
      return;
    }
    const range = selection.getRangeAt(0);
    const start = range.startContainer;
    const element = start.nodeType === 1 ? start : start.parentElement;
    // Text being typed, not read.
    if (element?.closest("input, textarea, [contenteditable]:not([contenteditable='false'])")) return;

    if (!state.textIndex) state.textIndex = timedIndex("first", state.currentChunk);
    const position = ReadAloudText.positionInIndex(state.textIndex, start, range.startOffset);
    if (position === lastJumpedFrom) return; // the same selection, grown or shrunk at its end
    const index = sentenceAt(position);
    if (index === -1) return;
    lastJumpedFrom = position;
    log("jump.selection", { chunk: index, from: state.currentChunk, paused: state.userPaused || undefined });
    jumpToSentence(index);
  }

  function jumpToSentence(index) {
    if (index === state.currentChunk && state.playing) return;
    stopCurrentAudio();
    state.currentChunk = index;
    if (state.userPaused || state.waitingForServer) {
      // Stay put, but have the sentence made, so Play starts it at once.
      state.record?.setCursor(index);
      pumpSynthesis({ kick: true });
      state._currentTime = 0;
      if (!state.waitingForServer) updateToolbarStatus(`${statusLabel()} — paused`);
      paintProgress();
      return;
    }
    playCurrentChunk();
  }

  document.addEventListener("selectionchange", onSelectionChange);

  // Published so a later injection can replace this copy cleanly. DOM and timer
  // cleanup comes first: everything below it can throw once this copy's
  // extension context has been invalidated, and a stranded toolbar or a live
  // health-check interval is what the user would actually notice.
  window.__readAloudTeardown = () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("selectionchange", onSelectionChange);
    clearTimeout(selectionTimer);
    removeToolbar();
    stopHighlightLoop();
    stopHealthCheckTimer();
    clearHighlights();
    speechSynthesis.cancel();
    state.active = false;
    state.playing = false;
    chrome.runtime.onMessage.removeListener(onAudioMessage);
    chrome.runtime.onMessage.removeListener(onToggleMessage);
    chrome.storage.onChanged.removeListener(onSettingsChanged);
    postMessage({ type: "STOP_AUDIO" });
  };
})();
