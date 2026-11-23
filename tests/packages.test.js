// Covers scripts/manifests.mjs against the real extension/manifest.json: each
// store package carries only its own browser's keys and loses nothing else
// (000055).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXT = path.join(__dirname, "..", "extension");
const SOURCE = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
const load = () => import("../scripts/manifests.mjs");

// Everything but the keys a browser-specific build is allowed to change.
function shared(manifest) {
  const { background, permissions, browser_specific_settings, ...rest } = manifest;
  return rest;
}

test("the Chrome package's manifest (000055)", async (t) => {
  const { chromeManifest } = await load();
  const chrome = chromeManifest(SOURCE);

  await t.test("runs the background as a service worker only", () => {
    assert.deepEqual(chrome.background, { service_worker: "background.js" });
  });

  await t.test("drops Firefox's settings", () => {
    assert.equal("browser_specific_settings" in chrome, false);
  });

  await t.test("keeps every permission, offscreen included", () => {
    assert.deepEqual(chrome.permissions, SOURCE.permissions);
    assert.ok(chrome.permissions.includes("offscreen"));
  });

  await t.test("changes nothing else", () => {
    assert.deepEqual(shared(chrome), shared(SOURCE));
  });
});

test("the Firefox package's manifest (000055)", async (t) => {
  const { firefoxManifest, SKIP } = await load();
  const firefox = firefoxManifest(SOURCE);

  await t.test("loads the player ahead of the background script, with no service worker", () => {
    assert.deepEqual(firefox.background, { scripts: ["offscreen.js", "background.js"] });
  });

  await t.test("asks for no offscreen permission, and only drops that one", () => {
    assert.deepEqual(
      firefox.permissions,
      SOURCE.permissions.filter((p) => p !== "offscreen")
    );
  });

  await t.test("keeps the add-on id, minimum version and data declaration", () => {
    assert.deepEqual(firefox.browser_specific_settings, SOURCE.browser_specific_settings);
    assert.ok(firefox.browser_specific_settings.gecko.id);
  });

  await t.test("leaves out the offscreen page, which nothing opens", () => {
    assert.deepEqual(SKIP.firefox, ["offscreen.html"]);
    assert.ok(fs.existsSync(path.join(EXT, "offscreen.html")));
  });

  await t.test("changes nothing else", () => {
    assert.deepEqual(shared(firefox), shared(SOURCE));
  });
});

test("deriving a manifest leaves the source alone", async () => {
  const { chromeManifest, firefoxManifest } = await load();
  const before = structuredClone(SOURCE);
  chromeManifest(SOURCE);
  firefoxManifest(SOURCE);
  assert.deepEqual(SOURCE, before);
});
