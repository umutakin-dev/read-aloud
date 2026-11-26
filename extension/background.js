const DEFAULT_SERVER_URL = "http://localhost:7860";

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "read-aloud",
    title: "Read Aloud",
    contexts: ["page", "selection"],
  });
});

// The content script is injected on invocation rather than declared for
// <all_urls>, so 122KB does not load into every page for a feature that is off
// until asked for — and so does not sit behind Chrome's broadest install
// warning either. activeTab covers this: it is granted by all three entry
// points below (action click, context menu item, commands shortcut).
// Order matters: content.js reads ReadAloudText and ReadAloudRecord at load.
const CONTENT_SCRIPTS = [
  "lib/textkit.js",
  "lib/record.js",
  "content.js",
];
const CONTENT_STYLES = ["content.css"];

async function toggleReadAloud(tabId, selectedText, via) {
  // Logged at each step, so a shortcut that "does nothing" says whether it
  // arrived at all and, if it did, where it stopped.
  log("toggle", { via, tab: tabId });
  if (tabId === undefined) return;
  const message = { type: "TOGGLE_READ_ALOUD", selectedText: selectedText || null };

  // Try messaging first. A live content script means this is the second
  // invocation — i.e. toggle off — and must not become a second injection.
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return;
  } catch {
    // Nothing listening: never injected, or orphaned by an extension reload.
  }

  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: CONTENT_STYLES });
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS });
    await chrome.tabs.sendMessage(tabId, message);
    log("toggle.injected", { tab: tabId });
  } catch (e) {
    // Genuinely unscriptable: chrome:// URLs, the PDF viewer, the Web Store.
    log("toggle.fail", { tab: tabId, error: e?.message || String(e) });
    showUnavailableBadge(tabId);
  }
}

function showUnavailableBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: "!" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#f38ba8" }).catch(() => {});
  chrome.action
    .setTitle({ tabId, title: "Read Aloud can't read this page" })
    .catch(() => {});
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    chrome.action.setTitle({ tabId, title: "Read Aloud" }).catch(() => {});
  }, 3000);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "read-aloud") {
    toggleReadAloud(tab?.id, info.selectionText, "menu");
  }
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-read-aloud") {
    toggleReadAloud(tab?.id, null, "shortcut");
  }
});

// ─── Audio player ─────────────────────────────────────────────────────────
// Firefox: the manifest loads offscreen.js into this same background page, so
// the player is right here and is called directly. Chrome: this is a service
// worker with no DOM, and the player lives in an offscreen document.
const inlinePlayer = globalThis.ReadAloudPlayer ?? null;

if (inlinePlayer) {
  // AUDIO_* events would otherwise go out by runtime.sendMessage, which never
  // reaches this page's own listener. The player's log lines stay here.
  inlinePlayer.emit = (message) =>
    message.type === "LOG" ? recordLog(message) : relayAudioEvent(message);
}

// The offscreen document outlives the service worker, so its existence has to
// be queried rather than remembered in a module flag that resets on eviction.
const OFFSCREEN_URL = "offscreen.html";

async function hasOffscreen() {
  if (inlinePlayer) return true;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  return contexts.length > 0;
}

// Creating a second document throws, and two callers can race, so they share
// whichever creation is already in flight.
let creating = null;

async function ensureOffscreen() {
  if (inlinePlayer || (await hasOffscreen())) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Playing TTS audio for Read Aloud extension",
      })
      .finally(() => {
        creating = null;
      });
  }
  try {
    await creating;
  } catch (e) {
    // Lost the race to another caller — the document exists either way.
    if (!e.message?.includes("Only a single offscreen")) throw e;
  }
}

// Resolves null when nothing answered, rather than rejecting — callers decide
// whether that is worth creating the document for.
function sendToOffscreen(message) {
  return new Promise((resolve) => {
    if (inlinePlayer) {
      let answered = false;
      const respond = (response) => {
        answered = true;
        resolve(response ?? null);
      };
      const later = inlinePlayer.handle(message, respond);
      if (later !== true && !answered) resolve(null);
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      void chrome.runtime.lastError;
      resolve(response ?? null);
    });
  });
}

// ─── Active reading tab ───────────────────────────────────────────────────
// Chrome evicts the service worker after ~30s idle. During playback the 50ms
// AUDIO_TIME traffic keeps it alive, but pausing stops that, so a module
// variable would be gone by the time playback resumes and every AUDIO_ENDED
// relay would be dropped. Session storage survives; the module variable is
// just a cache so the 50ms relay is not a storage read.
const ACTIVE_TAB_KEY = "activeTabId";
let activeTabId = null;

async function setActiveTab(tabId) {
  if (tabId === undefined) return;
  activeTabId = tabId;
  await chrome.storage.session.set({ [ACTIVE_TAB_KEY]: tabId });
}

async function getActiveTab() {
  if (activeTabId !== null) return activeTabId;
  const result = await chrome.storage.session.get(ACTIVE_TAB_KEY);
  activeTabId = result[ACTIVE_TAB_KEY] ?? null;
  return activeTabId;
}

async function clearActiveTab() {
  activeTabId = null;
  await chrome.storage.session.remove(ACTIVE_TAB_KEY);
}

// Reading tab closed mid-playback: stop the audio and tear the document down,
// otherwise it keeps playing with nothing to highlight.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if ((await getActiveTab()) !== tabId) return;
  log("tab.closed", { tab: tabId });
  await clearActiveTab();
  if (inlinePlayer) {
    await sendToOffscreen({ target: "offscreen", type: "STOP" });
  } else if (await hasOffscreen()) {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
});

// Audio events from the player go to the tab that is reading.
function relayAudioEvent(message) {
  getActiveTab().then((tabId) => {
    if (tabId !== null) chrome.tabs.sendMessage(tabId, message).catch(() => {});
  });
}

// ─── Debug log (000052) ───────────────────────────────────────────────────
// A record of what happened, so a failure can be read afterwards instead of
// reproduced with two consoles open. The tab, the popup and the player send
// LOG messages here; this file logs its own events directly. Events, not
// content: senders pass at most a short preview of the text involved.
//
// Kept in storage.local so it outlives the service worker (Chrome evicts it
// after ~30s idle) and a browser restart. Entries are batched, and the writes
// are chained so two batches never read the same old log and drop each other.
const LOG_KEY = "debugLog";
const LOG_MAX = 2000;
const LOG_FLUSH_MS = 1000;
let logPending = [];
let logTimer = null;
let logWrites = Promise.resolve();

function recordLog({ src, ev, ...details }, tabId) {
  const entry = { t: new Date().toISOString(), src: src || "?", ev: ev || "?" };
  if (tabId !== undefined) entry.tab = tabId;
  for (const [key, value] of Object.entries(details)) {
    if (key !== "type" && value !== undefined) entry[key] = value;
  }
  logPending.push(entry);
  if (!logTimer) logTimer = setTimeout(flushLog, LOG_FLUSH_MS);
}

function log(ev, details = {}) {
  recordLog({ src: "bg", ev, ...details });
}

function flushLog() {
  clearTimeout(logTimer);
  logTimer = null;
  const batch = logPending;
  logPending = [];
  logWrites = logWrites
    .then(async () => {
      if (!batch.length) return;
      const { [LOG_KEY]: saved = [] } = await chrome.storage.local.get(LOG_KEY);
      await chrome.storage.local.set({ [LOG_KEY]: saved.concat(batch).slice(-LOG_MAX) });
    })
    .catch(() => {});
  return logWrites;
}

// One line per event: time, source, event, then its details as key=value.
function formatLog(entries) {
  return entries
    .map(({ t, src, ev, ...details }) => {
      const rest = Object.entries(details)
        .map(([k, v]) => `${k}=${typeof v === "string" && /\s/.test(v) ? JSON.stringify(v) : v}`)
        .join(" ");
      return `${t} ${src.padEnd(6)} ${ev}${rest ? " " + rest : ""}`;
    })
    .join("\n");
}

async function readLog() {
  await flushLog();
  const { [LOG_KEY]: saved = [] } = await chrome.storage.local.get(LOG_KEY);
  return saved;
}

// Each start is a restart of the service worker (Chrome) or of the background
// page (Firefox). Anything held only in memory was lost at that point.
log("bg.start", { player: inlinePlayer ? "inline" : "offscreen" });

// ─── Message handler ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOG") {
    recordLog(message, sender?.tab?.id);
    return;
  }

  if (message.type === "GET_LOG") {
    readLog()
      .then((entries) => sendResponse({ ok: true, count: entries.length, text: formatLog(entries) }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "CLEAR_LOG") {
    flushLog()
      .then(() => chrome.storage.local.remove(LOG_KEY))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (
    message.type === "AUDIO_ENDED" ||
    message.type === "AUDIO_ERROR" ||
    message.type === "AUDIO_TIME" ||
    message.type === "ENGINE_PROGRESS"
  ) {
    relayAudioEvent(message);
    return;
  }

  if (message.type === "TTS_REQUEST") {
    handleSpeechRequest(message, sender).then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  if (message.type === "HEALTH_CHECK") {
    handleEngineHealth(message.serverUrl).then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  if (message.type === "GET_VOICES") {
    handleVoices(message.serverUrl).then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  // Audio control messages from content script → offscreen
  if (message.type === "PLAY_AUDIO") {
    const play = {
      target: "offscreen",
      type: "PLAY",
      key: message.key,
      audio_base64: message.audio_base64,
      speed: message.speed,
      startAt: message.startAt,
    };

    // Try the document first. Checking it exists costs a getContexts round
    // trip, and this runs at every chunk boundary where the gap is audible —
    // so pay for it only when the send actually fails.
    setActiveTab(sender.tab?.id)
      .then(() => sendToOffscreen(play))
      .then((response) => {
        if (response) {
          sendResponse(response);
          return;
        }
        log("player.missing", { key: message.key });
        return ensureOffscreen()
          .then(() => sendToOffscreen(play))
          .then((retry) => {
            if (!retry) log("player.noanswer", { key: message.key });
            sendResponse(retry || { ok: false, error: "offscreen player did not respond" });
          });
      })
      .catch((err) => {
        log("play.fail", { key: message.key, error: err.message });
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  // Fire-and-forget: a lost preload only costs the fast path, and PLAY falls
  // back to carrying the audio itself.
  if (message.type === "PRELOAD_AUDIO") {
    sendToOffscreen({
      target: "offscreen",
      type: "PRELOAD",
      key: message.key,
      audio_base64: message.audio_base64,
    });
    return;
  }

  // Resume is the one control that can legitimately find nothing to talk to:
  // Chrome tears an AUDIO_PLAYBACK offscreen document down once it stops
  // playing, so a pause of a couple of minutes leaves nothing to resume. Say so
  // rather than dropping the message, and the content script replays instead.
  if (message.type === "RESUME_AUDIO") {
    hasOffscreen()
      .then((exists) => {
        if (!exists) {
          log("resume.nodocument");
          sendResponse({ resumed: false, reason: "offscreen document is gone" });
          return;
        }
        return sendToOffscreen({ target: "offscreen", type: "RESUME" }).then((response) =>
          sendResponse(response || { resumed: false, reason: "player did not respond" })
        );
      })
      .catch((err) => sendResponse({ resumed: false, reason: err.message }));
    return true;
  }

  const CONTROL = {
    PAUSE_AUDIO: "PAUSE",
    STOP_AUDIO: "STOP",
    SET_AUDIO_SPEED: "SET_SPEED",
  };

  if (CONTROL[message.type]) {
    hasOffscreen().then((exists) => {
      if (!exists) return;
      sendToOffscreen({
        target: "offscreen",
        type: CONTROL[message.type],
        speed: message.speed,
      });
    });
    return;
  }
});

// ─── Choosing an engine (000046) ──────────────────────────────────────────
// Two engines produce the same response: the local server (exact word timings,
// 16–80x realtime) and Kokoro in the browser on WebGPU (sentence-exact, words
// estimated, ~4x). The `engine` setting picks one:
//
//   auto     the server when it answers, otherwise the browser (the default,
//            so installing nothing works and starting the server upgrades)
//   server   only the server; when it is down, reading waits for it
//   browser  only the browser engine
const DEFAULT_ENGINE = "auto";

async function getEngineSetting() {
  const { engine } = await chrome.storage.local.get("engine");
  return engine === "server" || engine === "browser" ? engine : DEFAULT_ENGINE;
}

// In auto mode every request asks "is the server up?". A refused localhost
// connection is fast, but a few seconds of memory saves a round trip per
// chunk. Module state is fine here: losing it on eviction costs one check.
const SERVER_MEMORY_MS = 10000;
let serverSeen = null; // { url, ok, at }

async function serverReachable(serverUrl) {
  const url = serverUrl || (await getServerUrl());
  if (serverSeen && serverSeen.url === url && Date.now() - serverSeen.at < SERVER_MEMORY_MS) {
    return serverSeen.ok;
  }
  const { ok } = await handleHealthCheck(url);
  serverSeen = { url, ok, at: Date.now() };
  return ok;
}

// Whether this browser can run the engine never changes within a session.
let browserSupport = null;

async function browserEngineSupport() {
  if (!browserSupport) {
    browserSupport = ensureOffscreen()
      .then(() => sendToOffscreen({ target: "offscreen", type: "ENGINE_SUPPORTED" }))
      .then((r) =>
        r?.ok ? { ok: r.supported, reason: r.reason } : { ok: false, reason: r?.error || "no player" }
      );
    // A failure to even ask (engine not built, player missing) is worth
    // asking again after the developer fixes it.
    browserSupport.then((s) => {
      if (!s.ok && !/WebGPU/.test(s.reason || "")) browserSupport = null;
    });
  }
  return browserSupport;
}

async function chooseEngine(serverUrl) {
  const setting = await getEngineSetting();
  if (setting !== "auto") return setting;
  return (await serverReachable(serverUrl)) ? "server" : "browser";
}

// "Can anything speak right now, and which engine would?" — what the toolbar
// polls and the popup shows. ok:false is what puts the toolbar into waiting.
async function handleEngineHealth(serverUrl) {
  const setting = await getEngineSetting();
  if (setting !== "browser" && (await serverReachable(serverUrl))) {
    return { ok: true, engine: "server", setting };
  }
  if (setting === "server") {
    return { ok: false, engine: "server", setting, reason: "server unreachable" };
  }
  const support = await browserEngineSupport();
  if (support.ok) return { ok: true, engine: "browser", setting };
  // Without WebGPU no Kokoro will ever speak in this browser unless a server
  // is started, so the tab reads with the system voice instead of nothing
  // (000069). Other failures (the engine not built) may be fixed and are
  // asked again, so they still wait, as does a setting of server only.
  const noKokoro = /WebGPU/.test(support.reason || "");
  return { ok: false, engine: "browser", setting, reason: support.reason, noKokoro };
}

async function handleSpeechRequest(message, sender) {
  const started = Date.now();
  const response = await synthesizeWithEngine(message, sender);
  log(response.ok ? "synth.done" : "synth.fail", {
    engine: response.engine,
    ms: Date.now() - started,
    chars: message.text?.length,
    error: response.error,
  });
  return response;
}

async function synthesizeWithEngine(message, sender) {
  const engine = await chooseEngine(message.serverUrl);
  if (engine === "server") {
    const response = await handleTTSRequest(message);
    // A failure here may be the server having just gone away; forget the
    // last answer so auto mode re-checks instead of trusting it for 10s.
    if (!response.ok) serverSeen = null;
    return { ...response, engine };
  }

  // Download progress goes to the tab that asked, and the first request can
  // arrive before any audio has made it the active tab.
  await setActiveTab(sender?.tab?.id);
  await ensureOffscreen();
  const response = await sendToOffscreen({
    target: "offscreen",
    type: "ENGINE_SYNTHESIZE",
    text: message.text,
    voice: message.voice || "af_heart",
  });
  return response
    ? { ok: response.ok, data: response.data, error: response.error, engine }
    : { ok: false, error: "the audio player did not respond", engine };
}

async function handleVoices(serverUrl) {
  const engine = await chooseEngine(serverUrl);
  if (engine === "server") return { ...(await handleGetVoices(serverUrl)), engine };
  await ensureOffscreen();
  const response = await sendToOffscreen({ target: "offscreen", type: "ENGINE_VOICES" });
  return { ok: Boolean(response?.ok), voices: response?.voices || [], error: response?.error, engine };
}

async function getServerUrl() {
  const result = await chrome.storage.local.get("serverUrl");
  return result.serverUrl || DEFAULT_SERVER_URL;
}

async function handleHealthCheck(serverUrl) {
  const url = serverUrl || (await getServerUrl());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: controller.signal,
    });
    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleGetVoices(serverUrl) {
  const url = serverUrl || (await getServerUrl());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${url}/api/voices`, {
      signal: controller.signal,
    });
    const data = await response.json();
    return { ok: true, voices: data };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleTTSRequest(message) {
  const serverUrl = message.serverUrl || (await getServerUrl());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${serverUrl}/api/tts-with-timestamps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message.text,
        voice: message.voice || "af_heart",
        // Always 1.0 — playback speed is applied by the offscreen player via
        // audio.playbackRate. Synthesizing at a rate as well would compound them.
        speed: 1.0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TTS server error: ${response.status}`);
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}
