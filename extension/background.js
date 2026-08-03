const DEFAULT_SERVER_URL = "http://localhost:7860";

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "read-aloud",
    title: "Read Aloud",
    contexts: ["page", "selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "read-aloud") {
    chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_READ_ALOUD",
      selectedText: info.selectionText || null,
    });
  }
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-read-aloud") {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_READ_ALOUD" });
  }
});

// ─── Offscreen document for audio playback ────────────────────────────────
let offscreenCreated = false;

async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Playing TTS audio for Read Aloud extension",
    });
    offscreenCreated = true;
  } catch (e) {
    // Already exists
    if (e.message?.includes("Only a single offscreen")) {
      offscreenCreated = true;
    } else {
      throw e;
    }
  }
}

// Track which tab is actively reading
let activeTabId = null;

// ─── Message handler ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Forward audio events from offscreen to the active content script tab
  if (message.type === "AUDIO_ENDED" || message.type === "AUDIO_ERROR" || message.type === "AUDIO_TIME") {
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
    }
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
    activeTabId = sender.tab?.id;
    ensureOffscreen().then(() => {
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "PLAY",
        audio_base64: message.audio_base64,
        speed: message.speed,
      }, sendResponse);
    }).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  if (message.type === "PAUSE_AUDIO" || message.type === "RESUME_AUDIO" || message.type === "STOP_AUDIO" || message.type === "SET_AUDIO_SPEED") {
    const typeMap = {
      PAUSE_AUDIO: "PAUSE",
      RESUME_AUDIO: "RESUME",
      STOP_AUDIO: "STOP",
      SET_AUDIO_SPEED: "SET_SPEED",
    };
    if (offscreenCreated) {
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: typeMap[message.type],
        speed: message.speed,
      });
    }
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
