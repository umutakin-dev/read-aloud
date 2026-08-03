document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const voiceSelect = document.getElementById("voice-select");
  const speedInput = document.getElementById("speed-input");
  const speedValue = document.getElementById("speed-value");
  const serverUrlInput = document.getElementById("server-url");
  const btnSave = document.getElementById("btn-save");

  // Load saved settings
  const settings = await chrome.storage.local.get(["voice", "speed", "serverUrl"]);
  if (settings.speed) {
    speedInput.value = settings.speed;
    speedValue.textContent = `${settings.speed}x`;
  }
  if (settings.serverUrl) {
    serverUrlInput.value = settings.serverUrl;
  }

  // Show the saved voice straight away. Without this the select holds only the
  // hardcoded default until the voice list arrives, and saving while the server
  // is unreachable would silently overwrite the user's choice.
  function showSavedVoice() {
    if (!settings.voice) return;
    if (!voiceSelect.querySelector(`option[value="${CSS.escape(settings.voice)}"]`)) {
      const opt = document.createElement("option");
      opt.value = settings.voice;
      opt.textContent = settings.voice;
      voiceSelect.appendChild(opt);
    }
    voiceSelect.value = settings.voice;
  }

  showSavedVoice();

  speedInput.addEventListener("input", () => {
    speedValue.textContent = `${parseFloat(speedInput.value).toFixed(1)}x`;
  });

  // Check server health and load voices
  async function checkServer() {
    const serverUrl = serverUrlInput.value.replace(/\/$/, "");
    statusDot.className = "dot";
    statusText.textContent = "Checking server...";

    const healthResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "HEALTH_CHECK", serverUrl },
        resolve
      );
    });

    if (healthResponse && healthResponse.ok) {
      statusDot.classList.add("connected");
      statusText.textContent = `Connected (${healthResponse.data.engine})`;

      // Load voices
      const voicesResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "GET_VOICES", serverUrl },
          resolve
        );
      });

      if (voicesResponse && voicesResponse.ok) {
        voiceSelect.innerHTML = "";
        for (const voice of voicesResponse.voices) {
          const opt = document.createElement("option");
          opt.value = voice.id;
          opt.textContent = `${voice.name} (${voice.gender})`;
          voiceSelect.appendChild(opt);
        }
        // Re-select afterwards; this also keeps a saved voice the server no
        // longer offers rather than silently dropping to the first option.
        showSavedVoice();
      }
    } else {
      statusDot.classList.add("disconnected");
      statusText.textContent = "Server unavailable (will use browser TTS)";
    }
  }

  checkServer();

  // The manifest only grants the default localhost server. Any other host needs
  // its permission requested at runtime — and it has to happen inside the click
  // handler, since chrome.permissions.request() requires a user gesture.
  async function ensureServerPermission(serverUrl) {
    let origin;
    try {
      origin = `${new URL(serverUrl).origin}/*`;
    } catch {
      return { ok: false, error: "Not a valid URL" };
    }
    if (await chrome.permissions.contains({ origins: [origin] })) {
      return { ok: true };
    }
    const granted = await chrome.permissions.request({ origins: [origin] });
    return granted
      ? { ok: true }
      : { ok: false, error: `Permission denied for ${origin}` };
  }

  function showSaveError(message) {
    statusDot.className = "dot disconnected";
    statusText.textContent = message;
    btnSave.textContent = "Save Settings";
  }

  btnSave.addEventListener("click", async () => {
    const serverUrl = serverUrlInput.value.trim().replace(/\/$/, "");

    const permission = await ensureServerPermission(serverUrl);
    if (!permission.ok) {
      showSaveError(permission.error);
      return;
    }

    const newSettings = {
      voice: voiceSelect.value,
      speed: parseFloat(speedInput.value),
      serverUrl,
    };
    await chrome.storage.local.set(newSettings);
    // Keep the snapshot current — checkServer() below re-applies settings.voice.
    Object.assign(settings, newSettings);
    serverUrlInput.value = serverUrl;
    btnSave.textContent = "Saved!";
    setTimeout(() => {
      btnSave.textContent = "Save Settings";
    }, 1500);
    checkServer();
  });
});
