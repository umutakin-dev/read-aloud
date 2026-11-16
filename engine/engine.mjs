// The in-browser Kokoro engine (000046). Bundled by scripts/build-engine.mjs
// into extension/engine/engine.js and loaded lazily by the audio player
// (offscreen.js), so nothing here costs anything until it is used.
//
// Spike 000025 settled the configuration:
//   - WebGPU at fp32. fp16 hangs on Firefox; q8 is wrong on WebGPU and WASM
//     is 0.5–0.8x realtime, slower than listening.
//   - kokoro-js's unbundled build on transformers.js 4.x. Its own bundle pins
//     onnxruntime-web 1.22.0-dev, which produces static on Firefox's WebGPU.
//     The build refuses to produce a bundle with the old runtime in it.
import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { env } from "@huggingface/transformers";
import { assembleResponse } from "./speechkit.mjs";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEVICE = "webgpu";
const DTYPE = "fp32";

// MV3 forbids loading code from a CDN, which is where transformers.js points
// onnxruntime by default. The runtime ships inside the extension instead.
// The wasm cache is off because it hands the loader over as a blob: URL, which
// the extension's script-src refuses.
export function configure(ortBaseUrl) {
  env.useWasmCache = false;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${ortBaseUrl}ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${ortBaseUrl}ort-wasm-simd-threaded.asyncify.wasm`,
  };
}

// Whether this browser can run the engine at all. WebGPU is the requirement;
// without it there is no configuration fast enough to read along with.
export async function supported() {
  if (!globalThis.navigator?.gpu) return { ok: false, reason: "WebGPU is not available in this browser" };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "WebGPU found no usable GPU" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `WebGPU failed: ${e.message}` };
  }
}

let loading = null;

// Loads once per document lifetime and shares the promise between callers, so
// a prefetch and the chunk being played never start two downloads.
//
// onProgress receives { phase, percent } — "download" while model files come
// in (only the first time; afterwards they come from Cache Storage), then
// "warmup". A failed load clears the promise so the next request retries.
export function load(onProgress = () => {}) {
  if (!loading) {
    loading = loadModel(onProgress).catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

async function loadModel(onProgress) {
  const files = new Map();
  let lastReported = -1;
  const report = () => {
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    const percent = total ? Math.floor((loaded / total) * 100) : 0;
    if (percent !== lastReported) {
      lastReported = percent;
      onProgress({ phase: "download", percent });
    }
  };

  const tts = await KokoroTTS.from_pretrained(MODEL, {
    device: DEVICE,
    dtype: DTYPE,
    progress_callback: (p) => {
      if (p.status === "progress" && p.file && p.total) {
        files.set(p.file, { loaded: p.loaded, total: p.total });
        report();
      }
    },
  });

  // The first synthesis compiles every WebGPU shader the model needs. In the
  // spike that put ~9.7s in front of the first sentence; paying it here moves
  // it out of the reading.
  onProgress({ phase: "warmup", percent: 100 });
  await tts.generate("Ready.", { voice: "af_heart" });
  return tts;
}

// One request in, one server-shaped response out:
// { audio_base64, sample_rate, timestamps: [{ word, start, end, start_char, end_char }] }
//
// Always at 1.0x: playback speed is applied by the player, the same as for the
// server, so a speed change never invalidates audio that is already made.
export async function synthesize(text, voice, onProgress) {
  const tts = await load(onProgress);

  // A bare string makes stream() build a splitter it never closes, and the
  // last sentence never comes out (found in the spike). Close it ourselves.
  const splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();

  const sentences = [];
  let sampleRate = 24000;
  for await (const chunk of tts.stream(splitter, { voice, speed: 1 })) {
    sampleRate = chunk.audio.sampling_rate;
    sentences.push({ text: chunk.text, phonemes: chunk.phonemes, samples: chunk.audio.audio });
  }
  return assembleResponse(text, sentences, sampleRate);
}

// Same shape as the server's /api/voices, so the popup lists either.
//
// The table is static inside kokoro-js, reachable only through an instance
// getter that never reads `this`. Calling it off the prototype lists the voices
// without loading the model — opening the popup must not start a 310MB
// download.
export function voices() {
  const table = Object.getOwnPropertyDescriptor(KokoroTTS.prototype, "voices").get.call(null);
  return Object.entries(table).map(([id, v]) => ({
    id,
    name: v.name,
    language: v.language,
    gender: v.gender,
  }));
}
