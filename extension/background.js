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
// Order matters: content.js reads ReadAloudText out of textkit at load.
const CONTENT_SCRIPTS = ["lib/Readability.js", "lib/textkit.js", "content.js"];
const CONTENT_STYLES = ["content.css"];

async function toggleReadAloud(tabId, selectedText) {
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
  } catch {
    // Genuinely unscriptable: chrome:// URLs, the PDF viewer, the Web Store.
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
    toggleReadAloud(tab?.id, info.selectionText);
  }
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-read-aloud") {
    toggleReadAloud(tab?.id);
  }
});

// ─── Audio player ─────────────────────────────────────────────────────────
// Firefox: the manifest loads offscreen.js into this same background page, so
// the player is right here and is called directly. Chrome: this is a service
// worker with no DOM, and the player lives in an offscreen document.
const inlinePlayer = globalThis.ReadAloudPlayer ?? null;

if (inlinePlayer) {
  // AUDIO_* events would otherwise go out by runtime.sendMessage, which never
  // reaches this page's own listener.
  inlinePlayer.emit = relayAudioEvent;
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

// ─── Message handler ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "AUDIO_ENDED" || message.type === "AUDIO_ERROR" || message.type === "AUDIO_TIME") {
    relayAudioEvent(message);
    return;
  }

  if (message.type === "TTS_REQUEST") {
    handleTTSRequest(message).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === "HEALTH_CHECK") {
    handleHealthCheck(message.serverUrl).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === "GET_VOICES") {
    handleGetVoices(message.serverUrl).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
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
        return ensureOffscreen()
          .then(() => sendToOffscreen(play))
          .then((retry) =>
            sendResponse(retry || { ok: false, error: "offscreen player did not respond" })
          );
      })
      .catch((err) => {
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
