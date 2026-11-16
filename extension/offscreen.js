// The audio player. Where it runs depends on the browser:
//
// - Chrome loads it into the offscreen document (offscreen.html), and it talks
//   to the service worker by runtime messages.
// - Firefox has no offscreen API, but its background is a page with a DOM, so
//   the manifest loads this file there, ahead of background.js. In that page
//   runtime.sendMessage never reaches the listeners of the page that sent it,
//   so background.js calls ReadAloudPlayer.handle directly and swaps `emit`
//   for its own relay to the reading tab.
//
// The runtime listener at the bottom is registered in both places. In the
// background page it is inert: nothing there sends a message targeted at
// "offscreen".
const ReadAloudPlayer = (globalThis.ReadAloudPlayer = {
  emit: (message) => chrome.runtime.sendMessage(message),
  handle: handlePlayerMessage,
});

let audio = null;
let objectUrl = null;
let timeInterval = null;

// One chunk's audio, decoded and loaded while the previous one is still
// playing. Only ever the immediately-next chunk, so this is a single slot
// rather than a cache to evict.
let preloaded = null; // { key, url, element }

function urlFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

// The content script drives word highlighting off this, so it has to keep
// flowing for as long as audio is actually moving.
function startTimeReporting() {
  clearInterval(timeInterval);
  timeInterval = setInterval(() => {
    if (audio && !audio.paused) {
      ReadAloudPlayer.emit({ type: "AUDIO_TIME", currentTime: audio.currentTime });
    }
  }, 50);
}

function releaseAudio() {
  clearInterval(timeInterval);
  if (audio) {
    // Detach before stopping, or the pause below fires a stale ended/error
    // event against the chunk that has already been abandoned.
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function releasePreloaded() {
  if (!preloaded) return;
  URL.revokeObjectURL(preloaded.url);
  preloaded = null;
}

function attach(element, url, startAt) {
  audio = element;
  objectUrl = url;

  // Resuming after this document was torn down mid-pause: pick up where the
  // previous element left off rather than restarting. Seeking needs the
  // duration, which is not known until metadata lands.
  if (startAt > 0) {
    const seek = () => {
      audio.currentTime = Math.min(startAt, audio.duration || startAt);
    };
    if (audio.readyState >= 1) seek();
    else audio.addEventListener("loadedmetadata", seek, { once: true });
  }

  audio.onended = () => {
    clearInterval(timeInterval);
    ReadAloudPlayer.emit({ type: "AUDIO_ENDED" });
  };
  audio.onerror = () => {
    clearInterval(timeInterval);
    ReadAloudPlayer.emit({
      type: "AUDIO_ERROR",
      message: audio?.error?.message || "unknown",
    });
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  return handlePlayerMessage(msg, sendResponse);
});

// ─── In-browser engine (000046) ───────────────────────────────────────────
// Kokoro on WebGPU, built by `npm run build` into engine/. It lives here, with
// the player, because this is the one context in both browsers that has a DOM
// and WebGPU: Chrome's offscreen document, Firefox's background page. Imported
// on first use, so a reader on the server engine never loads 1.8MB of it.
let enginePromise = null;

function engine() {
  if (!enginePromise) {
    enginePromise = import(chrome.runtime.getURL("engine/engine.js"))
      .then((mod) => {
        mod.configure(chrome.runtime.getURL("engine/ort/"));
        return mod;
      })
      .catch((e) => {
        enginePromise = null;
        throw new Error(
          `browser engine is not built (run npm run build): ${e.message}`
        );
      });
  }
  return enginePromise;
}

function reportEngineProgress(progress) {
  ReadAloudPlayer.emit({ type: "ENGINE_PROGRESS", ...progress });
}

function answer(sendResponse, work) {
  work
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
}

// Returns true when sendResponse will be called later, as a runtime listener
// does. Messages that never answer (PRELOAD, PAUSE, STOP, SET_SPEED) return
// undefined.
function handlePlayerMessage(msg, sendResponse) {
  if (msg.type === "ENGINE_SUPPORTED") {
    return answer(
      sendResponse,
      engine().then(async (mod) => {
        const support = await mod.supported();
        return { supported: support.ok, reason: support.reason };
      })
    );
  }

  if (msg.type === "ENGINE_SYNTHESIZE") {
    return answer(
      sendResponse,
      engine().then(async (mod) => ({
        data: await mod.synthesize(msg.text, msg.voice || "af_heart", reportEngineProgress),
      }))
    );
  }

  if (msg.type === "ENGINE_VOICES") {
    return answer(
      sendResponse,
      engine().then((mod) => ({ voices: mod.voices() }))
    );
  }

  if (msg.type === "PRELOAD") {
    releasePreloaded();
    const url = urlFromBase64(msg.audio_base64);
    const element = new Audio(url);
    element.preload = "auto";
    element.load();
    preloaded = { key: msg.key, url, element };
    return;
  }

  if (msg.type === "PLAY") {
    const ready = preloaded && preloaded.key === msg.key ? preloaded : null;

    // No audio and nothing preloaded under this key — the document was torn
    // down, or the preload never arrived. Ask for the bytes.
    if (!ready && !msg.audio_base64) {
      sendResponse({ ok: false, needAudio: true });
      return true;
    }

    releaseAudio();

    let url, element;
    if (ready) {
      preloaded = null;
      url = ready.url;
      element = ready.element;
    } else {
      releasePreloaded();
      url = urlFromBase64(msg.audio_base64);
      element = new Audio(url);
    }

    attach(element, url, msg.startAt || 0);
    audio.playbackRate = msg.speed || 1.0;

    audio
      .play()
      .then(() => {
        startTimeReporting();
        sendResponse({ ok: true, usedPreload: Boolean(ready) });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    return true; // async sendResponse
  }

  if (msg.type === "PAUSE") {
    if (audio) audio.pause();
    clearInterval(timeInterval);
    return;
  }

  if (msg.type === "RESUME") {
    // Report whether there was anything left to resume. Chrome may have torn
    // this document down during the pause, in which case the content script
    // has to replay from its saved position instead.
    if (!audio) {
      sendResponse({ resumed: false });
      return true;
    }
    audio
      .play()
      .then(() => {
        startTimeReporting();
        sendResponse({ resumed: true });
      })
      .catch((err) => {
        sendResponse({ resumed: false, error: err.message });
      });
    return true;
  }

  if (msg.type === "STOP") {
    releaseAudio();
    releasePreloaded();
    return;
  }

  if (msg.type === "SET_SPEED") {
    if (audio && msg.speed > 0) {
      try {
        audio.playbackRate = msg.speed;
      } catch (e) {
        /* ignore */
      }
    }
    return;
  }
}
