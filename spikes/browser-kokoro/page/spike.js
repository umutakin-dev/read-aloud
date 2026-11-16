// Spike for todo/000025, option 2: browser-side Kokoro with sentence-level
// highlighting, since per-token timestamps do not survive the ONNX export.
//
// Answers two things a Node run cannot:
//   - how fast Kokoro actually is on WebGPU, against 1.2x realtime on CPU
//   - whether exact sentences plus estimated words is good enough to live with
import { KokoroTTS, TextSplitterStream } from "kokoro-js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

const el = (id) => document.getElementById(id);
const ui = {
  device: el("device"),
  dtype: el("dtype"),
  voice: el("voice"),
  speed: el("speed"),
  speedLabel: el("speed-label"),
  load: el("load"),
  speak: el("speak"),
  stop: el("stop"),
  estimator: el("estimator"),
  support: el("support"),
  text: el("text"),
  reading: el("reading"),
  log: el("log"),
  mDevice: el("m-device"),
  mLoad: el("m-load"),
  mFirst: el("m-first"),
  mRate: el("m-rate"),
  mSentences: el("m-sentences"),
  mWall: el("m-wall"),
  mAlign: el("m-align"),
};

const log = (message) => {
  ui.log.textContent += message + "\n";
  ui.log.scrollTop = ui.log.scrollHeight;
};

let tts = null;
let playback = null; // cancels an in-flight reading

// ─── WebGPU availability ────────────────────────────────────────────────────
// Recorded in full because the WebGPU failures are wrong output, not errors:
// fp16 needs `shader-f16`, and a decoder buffer over a limit can corrupt
// silently rather than throw.
let adapterReport = "no WebGPU";
if (!navigator.gpu) {
  ui.support.textContent = "WebGPU unavailable — WASM only";
  ui.support.classList.add("warn");
  ui.device.value = "wasm";
} else {
  const adapter = await navigator.gpu.requestAdapter().catch(() => null);
  ui.support.textContent = adapter ? "WebGPU available" : "WebGPU present but no adapter";
  ui.support.classList.add(adapter ? "ok" : "warn");
  if (!adapter) ui.device.value = "wasm";
  if (adapter) {
    const info = adapter.info ?? {};
    const mb = (n) => `${Math.round(n / 2 ** 20)}MB`;
    adapterReport =
      `adapter: ${info.vendor || "?"} ${info.architecture || ""} ${info.description || ""}`.trim() +
      `\n  shader-f16: ${adapter.features.has("shader-f16")}` +
      `  maxStorageBufferBindingSize: ${mb(adapter.limits.maxStorageBufferBindingSize)}` +
      `  maxBufferSize: ${mb(adapter.limits.maxBufferSize)}`;
  }
}

// What the waveform actually contains. Distinguishes the WebGPU failure modes
// without anyone having to listen: NaN poisoning, silence (all ~0), and noise
// (a peak pinned near 1 with an RMS far above speech's usual ~0.05–0.15).
function waveformStats(samples) {
  let nan = 0;
  let peak = 0;
  let sumSq = 0;
  let finite = 0;
  for (const s of samples) {
    if (!Number.isFinite(s)) {
      nan++;
      continue;
    }
    finite++;
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sumSq += s * s;
  }
  const rms = finite ? Math.sqrt(sumSq / finite) : 0;
  let verdict = "looks like speech";
  if (nan > 0) verdict = "NaN in output";
  else if (peak < 1e-4) verdict = "silence";
  else if (rms > 0.3) verdict = "noise (RMS far above speech)";
  return `nan=${nan} peak=${peak.toFixed(3)} rms=${rms.toFixed(3)} → ${verdict}`;
}

ui.speed.addEventListener("input", () => {
  ui.speedLabel.value = `${Number(ui.speed.value).toFixed(1)}x`;
});

// ─── Loading ────────────────────────────────────────────────────────────────
ui.load.addEventListener("click", async () => {
  ui.load.disabled = true;
  const device = ui.device.value;
  const dtype = ui.dtype.value;
  ui.log.textContent = "";
  log(`Loading ${MODEL}\n  stack=${window.SPIKE_STACK} device=${device} dtype=${dtype}`);
  log(`  ${adapterReport}`);
  // WASM is multi-threaded only on an isolated page; without it every WASM
  // number is a single-core number. Serve with serve.py, not http.server.
  log(
    `  crossOriginIsolated=${self.crossOriginIsolated} ` +
      `cores=${navigator.hardwareConcurrency}` +
      (self.crossOriginIsolated ? "" : "  <- WASM will run on ONE thread")
  );
  if (device === "webgpu" && dtype.startsWith("q")) {
    log(
      "\n  WARNING: quantized weights on WebGPU are usually both slow and\n" +
        "  audibly degraded — dequantization runs constantly, and int8 damages\n" +
        "  a TTS model enough that the voice can stop sounding like the language\n" +
        "  it is reading. Prefer fp32 or fp16 here; q8 is a WASM choice.\n"
    );
  }

  const started = performance.now();
  try {
    tts = await KokoroTTS.from_pretrained(MODEL, {
      device,
      dtype,
      progress_callback: (p) => {
        if (p.status === "done" && p.file) log(`  fetched ${p.file}`);
      },
    });
  } catch (error) {
    log(`\nFAILED: ${error.message}`);
    log("Not every precision works on every backend — try another combination.");
    ui.load.disabled = false;
    return;
  }

  const seconds = (performance.now() - started) / 1000;
  ui.mDevice.textContent = `${device}, ${dtype}, stack=${window.SPIKE_STACK}`;
  ui.mLoad.textContent = `${seconds.toFixed(1)}s`;
  log(`\nReady in ${seconds.toFixed(1)}s`);

  ui.voice.innerHTML = "";
  for (const [id, info] of Object.entries(tts.voices)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${info.name} — ${info.language}, ${info.gender}`;
    if (id === "af_heart") option.selected = true;
    ui.voice.appendChild(option);
  }

  ui.load.disabled = false;
  ui.speak.disabled = false;
});

// ─── Estimating word timings ────────────────────────────────────────────────
// Sentence boundaries are exact — they come from real audio. Within a sentence
// there is nothing to go on, so the measured duration is divided across the
// words by weight. Two ways to weight them:
//
//   characters — crude, but always available
//   phonemes   — closer, since duration follows sounds rather than spelling
//
// The phoneme string is whitespace-separated roughly per word, but only
// roughly. Kokoro normalizes before phonemizing, and that moves in both
// directions: "1990" becomes two groups, "3:45" becomes three, while
// "that the" collapses into one. Measured over eight sentences, five aligned
// one-to-one — and the three that did not were deliberately chosen to break it.
// Ordinary prose aligns.
//
// So phoneme weighting is used when the counts line up and falls back to
// characters when they do not, rather than guessing an alignment.

// Stress marks are not sounds and punctuation is not spoken, so neither should
// carry weight. The length mark is kept: it genuinely means a longer vowel.
const NOT_A_SOUND = /[ˈˌ.,;:!?¡¿—…"«»“”()]/g;

function phonemeWeight(group) {
  return group.replace(NOT_A_SOUND, "").length;
}

function estimateWordSpans(sentence, phonemes, duration, mode) {
  const words = [...sentence.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));

  const groups = phonemes?.match(/\S+/g) ?? [];
  const aligned = mode === "phonemes" && groups.length === words.length;

  const weights = words.map((word, i) =>
    Math.max(aligned ? phonemeWeight(groups[i]) : word.text.length, 1)
  );
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;

  let elapsed = 0;
  words.forEach((word, i) => {
    const share = (weights[i] / total) * duration;
    word.startTime = elapsed;
    word.endTime = elapsed + share;
    elapsed += share;
  });

  return { words, aligned };
}

// ─── Reading ────────────────────────────────────────────────────────────────
ui.speak.addEventListener("click", async () => {
  if (!tts) return;
  ui.speak.disabled = true;
  ui.stop.disabled = false;

  const cancelled = { value: false };
  playback = cancelled;

  const text = ui.text.value.trim();
  const voice = ui.voice.value;
  const speed = Number(ui.speed.value);
  const estimator = ui.estimator.value;

  ui.reading.innerHTML = "";
  // The load log (stack, isolation, adapter) is kept above the reading log:
  // clearing it here is how the first isolated run lost its own evidence.
  log("\n── reading ──");
  const startedAt = performance.now();
  let firstAudioAt = null;
  let audioSeconds = 0;
  let alignedSentences = 0;
  let totalSentences = 0;
  const perSentence = [];

  // Synthesis has to be timed apart from playback. Measuring both together
  // caps the ratio at 1.0 however fast the model is, since playback of N
  // seconds of audio takes N seconds — which made the first version of this
  // number meaningless.
  let synthesisMs = 0;
  let mark = startedAt;

  // Synthesis and playback are interleaved deliberately: it is the only way to
  // see whether generation keeps ahead of the reading, which is the question
  // that decides whether this is usable at all.
  const splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();

  for await (const chunk of tts.stream(splitter, { voice, speed })) {
    // Everything since the last mark was spent producing this chunk.
    const generatedAt = performance.now();
    synthesisMs += generatedAt - mark;
    if (cancelled.value) break;

    if (firstAudioAt === null) {
      firstAudioAt = generatedAt - startedAt;
      ui.mFirst.textContent = `${(firstAudioAt / 1000).toFixed(2)}s`;
    }

    const samples = chunk.audio.audio;
    const rate = chunk.audio.sampling_rate;
    const duration = samples.length / rate;
    audioSeconds += duration;
    perSentence.push(duration);

    // Render this sentence, word by word, so the highlight has somewhere to go.
    const sentenceEl = document.createElement("span");
    sentenceEl.className = "sentence";
    const { words, aligned } = estimateWordSpans(chunk.text, chunk.phonemes, duration, estimator);

    totalSentences++;
    if (aligned) alignedSentences++;
    const basis = aligned ? "phonemes" : "characters";
    log(`${duration.toFixed(2)}s | ${basis.padEnd(10)} | ${chunk.text.slice(0, 46)}`);
    log(`         ${waveformStats(samples)}`);
    if (estimator === "phonemes" && !aligned) {
      const groups = chunk.phonemes?.match(/\S+/g) ?? [];
      log(`         ${words.length} words vs ${groups.length} phoneme groups — fell back`);
    }

    const wordEls = words.map((word) => {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = word.text;
      sentenceEl.append(span, " ");
      return span;
    });
    ui.reading.appendChild(sentenceEl);
    sentenceEl.scrollIntoView({ behavior: "smooth", block: "center" });

    await playSentence(samples, rate, sentenceEl, words, wordEls, cancelled);
    if (cancelled.value) break;

    // Restart the clock so the next iteration measures synthesis, not the
    // playback that just finished.
    mark = performance.now();
  }

  if (audioSeconds > 0) {
    const wallSeconds = (performance.now() - startedAt) / 1000;
    const synthSeconds = synthesisMs / 1000;
    const ratio = audioSeconds / synthSeconds;
    ui.mRate.textContent =
      `${audioSeconds.toFixed(1)}s of audio produced in ${synthSeconds.toFixed(1)}s — ` +
      `${ratio.toFixed(1)}x realtime` +
      (ratio < 1 ? " (slower than listening)" : "");
    ui.mWall.textContent =
      `${wallSeconds.toFixed(1)}s total, of which ${audioSeconds.toFixed(1)}s was playback`;
    ui.mSentences.textContent = perSentence.map((d) => `${d.toFixed(1)}s`).join(", ");
    ui.mAlign.textContent =
      estimator === "phonemes"
        ? `${alignedSentences}/${totalSentences} sentences weighted by phonemes, ` +
          `${totalSentences - alignedSentences} fell back to characters`
        : "not used — character weighting selected";
  }

  ui.speak.disabled = false;
  ui.stop.disabled = true;
  playback = null;
});

function playSentence(samples, rate, sentenceEl, words, wordEls, cancelled) {
  return new Promise((resolve) => {
    const context = new AudioContext();
    const buffer = context.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples instanceof Float32Array ? samples : new Float32Array(samples), 0);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    sentenceEl.classList.add("speaking");

    let current = -1;
    const tick = () => {
      if (cancelled.value) return;
      const now = context.currentTime;
      const index = words.findIndex((w) => now >= w.startTime && now < w.endTime);
      if (index !== -1 && index !== current) {
        if (current !== -1) wordEls[current].classList.remove("word-speaking");
        wordEls[index].classList.add("word-speaking");
        current = index;
      }
      if (!source.ended) requestAnimationFrame(tick);
    };

    source.onended = () => {
      source.ended = true;
      sentenceEl.classList.remove("speaking");
      wordEls.forEach((w) => w.classList.remove("word-speaking"));
      context.close();
      resolve();
    };

    source.start();
    requestAnimationFrame(tick);
  });
}

ui.stop.addEventListener("click", () => {
  if (playback) playback.value = true;
  ui.stop.disabled = true;
  ui.speak.disabled = false;
});
