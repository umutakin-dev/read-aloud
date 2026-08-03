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
      chrome.runtime.sendMessage({ type: "AUDIO_TIME", currentTime: audio.currentTime });
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
    chrome.runtime.sendMessage({ type: "AUDIO_ENDED" });
  };
  audio.onerror = () => {
    clearInterval(timeInterval);
    chrome.runtime.sendMessage({
      type: "AUDIO_ERROR",
      message: audio?.error?.message || "unknown",
    });
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return;

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
});
