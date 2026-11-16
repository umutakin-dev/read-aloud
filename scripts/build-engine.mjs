// Builds the in-browser engine into extension/engine/ (000046).
//
//   npm run build
//
// MV3 extensions may not load code from a CDN, so kokoro-js, transformers.js
// and onnxruntime-web are bundled here and the runtime's wasm is copied
// alongside. The output is generated and gitignored; everything else in
// extension/ is still plain source with no build step.
import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "extension", "engine");
const require = createRequire(import.meta.url);

// kokoro-js declares transformers.js 3.x and npm installs that copy nested
// under it, which brings onnxruntime-web 1.22.0-dev — the version that
// produces static on Firefox's WebGPU (spike 000025). Resolve every import of
// transformers.js to the top-level 4.x copy instead, whatever node_modules
// looks like.
// Neither package exports its package.json, so resolve an entry point and walk
// up to the package root.
async function packageRoot(name, from) {
  let dir = path.dirname(require.resolve(name, { paths: [from] }));
  for (;;) {
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
      if (pkg.name === name) return { dir, version: pkg.version };
    } catch {
      // not a package root yet
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`could not find the ${name} package root`);
    dir = parent;
  }
}
// require.resolve follows the "node" condition to transformers.node.cjs, which
// pulls in sharp and Node built-ins. The browser build is a fixed file.
const { dir: TRANSFORMERS_PACKAGE } = await packageRoot("@huggingface/transformers", ROOT);
const TRANSFORMERS = path.join(TRANSFORMERS_PACKAGE, "dist", "transformers.web.js");
const { dir: ORT_PACKAGE, version: ORT_VERSION } = await packageRoot(
  "onnxruntime-web",
  TRANSFORMERS_PACKAGE
);

const MIN_ORT = [1, 31];
const [major, minor] = ORT_VERSION.split(".").map(Number);
if (major < MIN_ORT[0] || (major === MIN_ORT[0] && minor < MIN_ORT[1])) {
  throw new Error(
    `onnxruntime-web ${ORT_VERSION} resolved; ${MIN_ORT.join(".")}+ is required. ` +
      "Older runtimes produce static on Firefox's WebGPU (spike 000025)."
  );
}

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, "ort"), { recursive: true });

const result = await build({
  entryPoints: [path.join(ROOT, "engine", "engine.mjs")],
  outfile: path.join(OUT, "engine.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["firefox140", "chrome124"],
  minify: true,
  legalComments: "linked",
  metafile: true,
  alias: {
    "@huggingface/transformers": TRANSFORMERS,
    // kokoro-js imports these to read voices from disk under Node. In a
    // browser it finds no readFile and fetches them instead.
    path: path.join(ROOT, "engine", "node-stub.mjs"),
    "fs/promises": path.join(ROOT, "engine", "node-stub.mjs"),
  },
  logLevel: "warning",
});

// Belt and braces: the alias above is what keeps the old runtime out; this is
// what proves it did.
const bundledOrt = Object.keys(result.metafile.inputs).filter((p) => p.includes("onnxruntime-web"));
const stale = bundledOrt.filter((p) => !p.startsWith(path.relative(ROOT, ORT_PACKAGE).replaceAll("\\", "/")));
if (stale.length) {
  throw new Error(`a second onnxruntime-web was bundled:\n  ${stale.join("\n  ")}`);
}

// WebGPU runs on the asyncify build; nothing else is loaded.
for (const file of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"]) {
  await copyFile(path.join(ORT_PACKAGE, "dist", file), path.join(OUT, "ort", file));
}

const mb = async (p) => ((await stat(p)).size / 2 ** 20).toFixed(1);
console.log(`engine built against onnxruntime-web ${ORT_VERSION}`);
console.log(`  engine/engine.js     ${await mb(path.join(OUT, "engine.js"))}MB`);
console.log(`  engine/ort/*.wasm    ${await mb(path.join(OUT, "ort", "ort-wasm-simd-threaded.asyncify.wasm"))}MB`);
