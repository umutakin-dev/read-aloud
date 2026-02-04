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

// Message relay for TTS server requests (content scripts can't fetch localhost directly in MV3)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TTS_REQUEST") {
    handleTTSRequest(message).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async response
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
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${serverUrl}/api/tts-with-timestamps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message.text,
        voice: message.voice || "af_heart",
        speed: message.speed || 1.0,
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
