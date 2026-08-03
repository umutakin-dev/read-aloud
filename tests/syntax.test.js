// content.js is the largest file in the extension and no test loads it — it is
// an IIFE that needs a live chrome API and a DOM the moment it runs. So a
// syntax error in it would reach the browser uncaught.
//
// Compiling every extension script catches that class of breakage cheaply.
// vm.Script parses and compiles without executing, so nothing here runs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const EXTENSION = path.join(__dirname, "..", "extension");

function scriptsIn(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return scriptsIn(full);
      return entry.name.endsWith(".js") ? [full] : [];
    });
}

test("every extension script compiles", async (t) => {
  const scripts = scriptsIn(EXTENSION);
  assert.ok(scripts.length >= 5, `only found ${scripts.length} scripts`);

  for (const file of scripts) {
    const relative = path.relative(EXTENSION, file).replaceAll(path.sep, "/");
    await t.test(relative, () => {
      const source = fs.readFileSync(file, "utf8");
      assert.doesNotThrow(
        () => new vm.Script(source, { filename: relative }),
        `${relative} does not parse`
      );
    });
  }
});
