let audio = null;
let timeInterval = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return;

  if (msg.type === "PLAY") {
    stopAudio();
    const binary = atob(msg.audio_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    audio = new Audio(url);
    audio.playbackRate = msg.speed || 1.0;

    audio.onended = () => {
      clearInterval(timeInterval);
      URL.revokeObjectURL(url);
      chrome.runtime.sendMessage({ type: "AUDIO_ENDED" });
    };
    audio.onerror = () => {
      clearInterval(timeInterval);
      URL.revokeObjectURL(url);
      chrome.runtime.sendMessage({ type: "AUDIO_ERROR", message: audio.error?.message || "unknown" });
    };

    audio.play().then(() => {
      // Report currentTime periodically
      timeInterval = setInterval(() => {
        if (audio && !audio.paused) {
          chrome.runtime.sendMessage({ type: "AUDIO_TIME", currentTime: audio.currentTime });
        }
      }, 50);
      sendResponse({ ok: true });
    }).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });

    return true; // async sendResponse
  }

  if (msg.type === "PAUSE") {
    if (audio) audio.pause();
    clearInterval(timeInterval);
  }

  if (msg.type === "RESUME") {
    if (audio) {
      audio.play();
      timeInterval = setInterval(() => {
        if (audio && !audio.paused) {
          chrome.runtime.sendMessage({ type: "AUDIO_TIME", currentTime: audio.currentTime });
        }
      }, 50);
    }
  }

  if (msg.type === "STOP") {
    stopAudio();
  }

  if (msg.type === "SET_SPEED") {
    if (audio && msg.speed > 0) {
      try { audio.playbackRate = msg.speed; } catch (e) { /* ignore */ }
    }
  }
});

function stopAudio() {
  clearInterval(timeInterval);
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
}
