// #000025 — can Kokoro run in the browser, and do per-token timestamps survive?
//
// The whole highlighting design rests on Kokoro's start_ts/end_ts per token.
// If the JS port only returns audio, word highlighting either dies or falls
// back to estimating positions, which is exactly the drift #000004 removed.
//
// Runs in Node to answer the API question cheaply. Browser performance needs a
// real browser and is a separate step.
import { KokoroTTS } from "kokoro-js";
import { StyleTextToSpeech2Model, AutoTokenizer, Tensor } from "@huggingface/transformers";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const TEXT = "In 1990 the world changed, quietly. It doesn't matter much now.";

const line = (s) => console.log("\n" + "─".repeat(72) + "\n" + s);

line("1. Loading the model");
let downloaded = 0;
const t0 = performance.now();
const tts = await KokoroTTS.from_pretrained(MODEL, {
  dtype: "q8",
  progress_callback: (p) => {
    if (p.status === "progress" && p.total) downloaded = Math.max(downloaded, p.total);
    if (p.status === "done" && p.file) console.log(`   fetched ${p.file}`);
  },
});
console.log(`   loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

line("2. What generate() returns");
const t1 = performance.now();
const audio = await tts.generate(TEXT, { voice: "af_heart" });
const genMs = performance.now() - t1;
console.log("   constructor:", audio.constructor.name);
console.log("   own keys:   ", Object.keys(audio));
console.log("   sampling:   ", audio.sampling_rate, "Hz");
console.log("   samples:    ", audio.audio.length);
const duration = audio.audio.length / audio.sampling_rate;
console.log(
  `   ${duration.toFixed(2)}s of audio in ${(genMs / 1000).toFixed(2)}s ` +
    `(${(duration / (genMs / 1000)).toFixed(1)}x realtime, CPU)`
);
console.log(
  "   TIMESTAMPS PRESENT:",
  Object.keys(audio).some((k) => /time|stamp|dur|token/i.test(k)) ? "yes" : "NO"
);

line("3. What stream() yields");
for await (const chunk of tts.stream(TEXT, { voice: "af_heart" })) {
  console.log("   keys:      ", Object.keys(chunk));
  console.log("   text:      ", JSON.stringify(chunk.text));
  console.log("   phonemes:  ", JSON.stringify(chunk.phonemes.slice(0, 60)));
  break;
}

line("4. Raw ONNX model outputs — is duration data there at all?");
// kokoro-js destructures only { waveform }. If the graph also emits per-phoneme
// durations, timestamps could be reconstructed the way Python Kokoro does.
const model = await StyleTextToSpeech2Model.from_pretrained(MODEL, { dtype: "q8" });
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const { input_ids } = tokenizer("hˈɛlˌoʊ wˈɜːld", { truncation: true });

const style = new Float32Array(256); // zeros are fine; we only want output names
const outputs = await model({
  input_ids,
  style: new Tensor("float32", style, [1, 256]),
  speed: new Tensor("float32", [1], [1]),
});
console.log("   output names:", Object.keys(outputs));
for (const [name, tensor] of Object.entries(outputs)) {
  console.log(`     ${name}: dims=${JSON.stringify(tensor.dims)} type=${tensor.type}`);
}

line("5. Voices offered");
const voices = Object.keys(tts.voices);
console.log(`   ${voices.length} voices`);
console.log(
  "   languages:",
  [...new Set(Object.values(tts.voices).map((v) => v.language))].join(", ")
);
