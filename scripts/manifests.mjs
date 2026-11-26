// Derives each browser's manifest from extension/manifest.json (000055).
//
// The source manifest serves both browsers so extension/ loads unpacked in
// either during development (000044); each browser ignores the other's keys
// but warns about them. The store packages carry only their own browser's
// keys, so neither store reviewer sees a warning. Pure functions: the tests
// check them against the real source manifest.

// Files in extension/ that one browser never loads.
export const SKIP = {
  // Firefox runs the player in its background page; there is no offscreen
  // document to create.
  firefox: ["offscreen.html"],
  chrome: [],
};

export function chromeManifest(source) {
  const manifest = structuredClone(source);
  // Chrome runs the background as a service worker; `scripts` is Firefox's.
  manifest.background = { service_worker: source.background.service_worker };
  delete manifest.browser_specific_settings;
  return manifest;
}

export function firefoxManifest(source) {
  const manifest = structuredClone(source);
  // Firefox has no offscreen API: offscreen.js runs in the background page,
  // ahead of background.js.
  manifest.permissions = source.permissions.filter((p) => p !== "offscreen");
  manifest.background = { scripts: source.background.scripts };
  // On a Mac, Ctrl in a shortcut means Command, and ⇧⌘U never reaches
  // Firefox on Umut's machine, while ⌃⇧U does (000060). MacCtrl is the
  // Control key itself. Chrome keeps ⇧⌘U, which works there.
  const toggle = manifest.commands?.["toggle-read-aloud"]?.suggested_key;
  if (toggle) toggle.mac = "MacCtrl+Shift+U";
  return manifest;
}

export const MANIFESTS = { chrome: chromeManifest, firefox: firefoxManifest };
