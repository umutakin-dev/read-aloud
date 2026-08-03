let audio = null;
let timeInterval = null;
let objectUrl = null;

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
    // event against the paragraph that has already been abandoned.
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return;

  if (msg.type === "PLAY") {
    releaseAudio();

    const binary = atob(msg.audio_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));

    audio = new Audio(objectUrl);
    audio.playbackRate = msg.speed || 1.0;

    // Resuming after this document was torn down mid-pause: pick up where the
    // previous element left off rather than restarting the paragraph. Seeking
    // needs the duration, which is not known until metadata lands.
    const startAt = msg.startAt || 0;
    if (startAt > 0) {
      audio.addEventListener(
        "loadedmetadata",
        () => {
          audio.currentTime = Math.min(startAt, audio.duration || startAt);
        },
        { once: true }
      );
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

    audio
      .play()
      .then(() => {
        startTimeReporting();
        sendResponse({ ok: true });
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
