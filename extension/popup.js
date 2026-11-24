document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const voiceSelect = document.getElementById("voice-select");
  const speedInput = document.getElementById("speed-input");
  const speedValue = document.getElementById("speed-value");
  const serverUrlInput = document.getElementById("server-url");
  const allowFallback = document.getElementById("allow-fallback");
  const engineSelect = document.getElementById("engine-select");
  const readCitations = document.getElementById("read-citations");
  const readFromSelection = document.getElementById("read-from-selection");
  const btnSave = document.getElementById("btn-save");

  // Load saved settings
  const settings = await chrome.storage.local.get([
    "voice",
    "speed",
    "serverUrl",
    "allowBrowserFallback",
    "engine",
    "readCitations",
    "readFromSelection",
  ]);
  engineSelect.value = settings.engine || "auto";
  readCitations.checked = settings.readCitations === true;
  // On unless turned off (000039).
  readFromSelection.checked = settings.readFromSelection !== false;

  // Saved on change rather than on Save: the status line below reports what
  // the background would actually use, and it reads the stored setting.
  engineSelect.addEventListener("change", async () => {
    await chrome.storage.local.set({ engine: engineSelect.value });
    settings.engine = engineSelect.value;
    checkServer();
  });
  // Off unless explicitly turned on — swapping in a noticeably worse voice
  // without being asked is not a graceful degradation.
  allowFallback.checked = settings.allowBrowserFallback === true;
  if (settings.speed) {
    speedInput.value = settings.speed;
    speedValue.textContent = `${settings.speed}x`;
  }
  if (settings.serverUrl) {
    serverUrlInput.value = settings.serverUrl;
  }

  // The toggle's real shortcut, not a hard-coded one. On a Mac both browsers
  // bind the manifest's "Ctrl+Shift+U" as Command+Shift+U, and the user can
  // rebind it, so a fixed hint named a key that did nothing (000050).
  // Chrome reports the binding as the platform shows it ("⇧⌘U"); Firefox
  // reports manifest syntax, where Ctrl means Command on macOS and MacCtrl
  // means Control. On a Mac, Firefox's form is turned into the same symbols,
  // so both browsers show the shortcut the way macOS menus do.
  const MAC_SYMBOLS = { MacCtrl: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Ctrl: "⌘", Command: "⌘" };
  // macOS always lists modifiers in this order, whatever order they were typed.
  const MAC_ORDER = ["⌃", "⌥", "⇧", "⌘"];

  function macShortcut(shortcut) {
    const parts = shortcut.split("+");
    if (parts.length < 2) return shortcut; // Chrome's symbols, already right
    const key = parts.pop();
    const mods = parts.map((p) => MAC_SYMBOLS[p] || p);
    mods.sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    return mods.join("") + key;
  }

  async function showShortcut() {
    const hint = document.getElementById("shortcut-hint");
    let shortcut = "";
    try {
      const commands = await chrome.commands.getAll();
      shortcut = commands.find((c) => c.name === "toggle-read-aloud")?.shortcut || "";
    } catch (e) {
      // No commands API: say nothing rather than guess.
      return;
    }
    const isMac = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || "");
    if (isMac) {
      shortcut = macShortcut(shortcut);
    }
    hint.textContent = "";
    if (!shortcut) {
      hint.textContent =
        "No keyboard shortcut is set. Choose one in the browser's extension shortcut settings.";
      return;
    }
    const key = document.createElement("kbd");
    key.textContent = shortcut;
    hint.append("Press ", key, " to toggle Read Aloud on any page");
  }

  showShortcut();

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

  // The offline message depends on this, so refresh it without waiting for Save.
  allowFallback.addEventListener("change", () => {
    if (statusDot.classList.contains("disconnected")) checkServer();
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
      statusText.textContent =
        healthResponse.engine === "browser"
          ? "Ready: Kokoro in this browser"
          : "Connected: Kokoro server";

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
      const what =
        healthResponse?.engine === "browser"
          ? `Can't run in this browser: ${healthResponse.reason || "unknown reason"}`
          : "Server unavailable";
      statusText.textContent = allowFallback.checked
        ? `${what} (will use browser speech)`
        : `${what} (Read Aloud will wait)`;
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

    try {
      if (await chrome.permissions.contains({ origins: [origin] })) {
        return { ok: true };
      }
      const granted = await chrome.permissions.request({ origins: [origin] });
      return granted
        ? { ok: true }
        : { ok: false, error: `Permission denied for ${origin}` };
    } catch (e) {
      // Only localhost is listed as optional in the manifest, deliberately —
      // claiming every host would put Read Aloud under "Access requested" on
      // every site you visit. Anything else has to be granted by hand.
      return {
        ok: false,
        error: "Only localhost can be granted here — for another host, allow it under Details > Site access in chrome://extensions",
      };
    }
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
      allowBrowserFallback: allowFallback.checked,
      engine: engineSelect.value,
      readCitations: readCitations.checked,
      readFromSelection: readFromSelection.checked,
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

  // ─── Debug log (000052) ─────────────────────────────────────────────────
  // The background keeps the log; this saves it as a text file. A plain
  // download link needs no "downloads" permission.
  const btnDownloadLog = document.getElementById("btn-download-log");
  const btnClearLog = document.getElementById("btn-clear-log");

  // Callback form, as checkServer uses, rather than relying on the promise.
  function ask(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        void chrome.runtime.lastError;
        resolve(response ?? null);
      });
    });
  }

  function flash(button, text) {
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => (button.textContent = original), 1500);
  }

  btnDownloadLog.addEventListener("click", async () => {
    const response = await ask({ type: "GET_LOG" });
    if (!response?.ok) {
      flash(btnDownloadLog, "Couldn't read the log");
      return;
    }
    const manifest = chrome.runtime.getManifest();
    const header = [
      `Read Aloud ${manifest.version} debug log, ${response.count} events`,
      `Saved ${new Date().toISOString()}`,
      `Browser: ${navigator.userAgent}`,
      "",
    ].join("\n");
    const blob = new Blob([header + response.text + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    link.download = `read-aloud-log-${stamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  btnClearLog.addEventListener("click", async () => {
    const response = await ask({ type: "CLEAR_LOG" });
    flash(btnClearLog, response?.ok ? "Cleared" : "Couldn't clear");
  });
});
