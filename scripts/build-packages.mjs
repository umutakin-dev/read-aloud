// Writes one copy of the extension per browser into dist/ (000055).
//
//   node scripts/build-packages.mjs          dist/chrome/, dist/firefox/
//   node scripts/build-packages.mjs --zip    and dist/read-aloud-<browser>-<version>.zip
//
// `npm run build` runs this after building the engine, and `npm run package`
// adds --zip. Each copy is extension/ with that browser's manifest (see
// manifests.mjs): load it unpacked to test what the store will get, or upload
// its zip.
import { zipSync } from "fflate";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFESTS, SKIP } from "./manifests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "extension");
const DIST = path.join(ROOT, "dist");
const zip = process.argv.includes("--zip");

// A package without the engine loads but cannot speak in the browser.
try {
  await stat(path.join(SRC, "engine", "engine.js"));
} catch {
  throw new Error("extension/engine/ is missing: run npm run build, which builds it first");
}

const source = JSON.parse(await readFile(path.join(SRC, "manifest.json"), "utf8"));

async function files(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix + entry.name;
    if (entry.isDirectory()) out.push(...(await files(path.join(dir, entry.name), rel + "/")));
    else out.push(rel);
  }
  return out;
}

const all = await files(SRC);

for (const [browser, derive] of Object.entries(MANIFESTS)) {
  const out = path.join(DIST, browser);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const manifest = JSON.stringify(derive(source), null, 2) + "\n";
  const included = all.filter((f) => f !== "manifest.json" && !SKIP[browser].includes(f));
  for (const f of included) {
    await cp(path.join(SRC, f), path.join(out, f), { recursive: true });
  }
  await writeFile(path.join(out, "manifest.json"), manifest);
  console.log(`dist/${browser}/  ${included.length + 1} files`);

  if (zip) {
    const entries = { "manifest.json": new TextEncoder().encode(manifest) };
    for (const f of included) entries[f] = new Uint8Array(await readFile(path.join(SRC, f)));
    // Fixed timestamps: the same tree zips to the same bytes.
    const name = `read-aloud-${browser}-${source.version}.zip`;
    const bytes = zipSync(entries, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") });
    await writeFile(path.join(DIST, name), bytes);
    console.log(`dist/${name}  ${(bytes.length / 2 ** 20).toFixed(1)}MB`);
  }
}
