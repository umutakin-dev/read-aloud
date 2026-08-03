// The manifest is config, so nothing catches a stale entry until Chrome does.
// #000008 was exactly that: a web_accessible_resources pointing at a player.html
// that had been deleted when playback moved to the offscreen document.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXTENSION = path.join(__dirname, "..", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, "manifest.json"), "utf8"));

const exists = (relative) => fs.existsSync(path.join(EXTENSION, relative));

test("manifest", async (t) => {
  await t.test("is manifest v3", () => {
    assert.equal(manifest.manifest_version, 3);
  });

  await t.test("every file it names exists", () => {
    const referenced = [
      manifest.background?.service_worker,
      manifest.action?.default_popup,
      ...Object.values(manifest.action?.default_icon ?? {}),
      ...Object.values(manifest.icons ?? {}),
      ...(manifest.content_scripts ?? []).flatMap((cs) => [...(cs.js ?? []), ...(cs.css ?? [])]),
      ...(manifest.web_accessible_resources ?? []).flatMap((war) => war.resources ?? []),
    ].filter(Boolean);

    for (const file of referenced) {
      assert.ok(exists(file), `manifest references ${file}, which does not exist`);
    }
  });

  await t.test("every file background.js injects exists", () => {
    // These are not in the manifest since the move to on-demand injection, so
    // nothing else would catch a rename.
    const source = fs.readFileSync(path.join(EXTENSION, "background.js"), "utf8");
    const listed = (name) => {
      const match = new RegExp(`const ${name} = \\[([^\\]]+)\\]`).exec(source);
      assert.ok(match, `${name} not found in background.js`);
      return match[1].match(/"([^"]+)"/g).map((s) => s.replaceAll('"', ""));
    };

    for (const file of [...listed("CONTENT_SCRIPTS"), ...listed("CONTENT_STYLES")]) {
      assert.ok(exists(file), `background.js injects ${file}, which does not exist`);
    }
  });

  await t.test("the offscreen document loads a script that exists", () => {
    const html = fs.readFileSync(path.join(EXTENSION, "offscreen.html"), "utf8");
    for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) {
      assert.ok(exists(src), `offscreen.html loads ${src}, which does not exist`);
    }
  });

  await t.test("the popup loads scripts and styles that exist", () => {
    const html = fs.readFileSync(path.join(EXTENSION, "popup.html"), "utf8");
    for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) {
      assert.ok(exists(src), `popup.html loads ${src}, which does not exist`);
    }
    for (const [, href] of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
      assert.ok(exists(href), `popup.html loads ${href}, which does not exist`);
    }
  });

  await t.test("does not declare a content script for every page", () => {
    // Removed in #000013: it carried Chrome's broadest install warning for a
    // feature that is off until invoked, and could not reach tabs that were
    // already open. Injection happens on demand instead.
    assert.equal(manifest.content_scripts, undefined);
  });

  await t.test("asks only for permissions it uses", () => {
    assert.deepEqual(
      [...manifest.permissions].sort(),
      ["activeTab", "contextMenus", "offscreen", "scripting", "storage"]
    );
  });

  await t.test("claims no wildcard hosts", () => {
    // #000007: http://*/* put Read Aloud under "Access requested" on every site.
    const hosts = [...(manifest.host_permissions ?? []), ...(manifest.optional_host_permissions ?? [])];
    for (const host of hosts) {
      assert.ok(
        /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(host),
        `${host} is broader than the local server this needs`
      );
    }
  });
});
