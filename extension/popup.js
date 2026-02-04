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
        if (settings.voice) {
          voiceSelect.value = settings.voice;
        }
      }
    } else {
      statusDot.classList.add("disconnected");
      statusText.textContent = "Server unavailable (will use browser TTS)";
    }
  }

  checkServer();

  btnSave.addEventListener("click", async () => {
    const newSettings = {
      voice: voiceSelect.value,
      speed: parseFloat(speedInput.value),
      serverUrl: serverUrlInput.value.replace(/\/$/, ""),
    };
    await chrome.storage.local.set(newSettings);
    btnSave.textContent = "Saved!";
    setTimeout(() => {
      btnSave.textContent = "Save Settings";
    }, 1500);
    checkServer();
  });
});
