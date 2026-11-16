// The browser engine's pure logic: turning Kokoro's per-sentence output into
// the exact response the local server gives, so content.js cannot tell the two
// engines apart except by how precise the word timings are.
//
// The server knows where every word falls in time, from Kokoro's duration
// predictor. The ONNX export the browser runs does not expose durations
// (spike 000025), so here only sentence boundaries are real: each sentence's
// audio is measured, and its words are spread across that duration by weight.
//
// No imports and no browser APIs, so tests/speechkit.test.js runs it in Node.

// Stress marks are not sounds and punctuation is not spoken, so neither carries
// weight. The length mark ː is kept: it genuinely means a longer vowel.
const NOT_A_SOUND = /[ˈˌ.,;:!?¡¿—…"«»“”()]/g;

export function phonemeWeight(group) {
  return group.replace(NOT_A_SOUND, "").length;
}

// Words of one sentence, timed by weight within [startTime, startTime+duration].
//
// Phonemes track duration better than spelling, but Kokoro normalizes before
// phonemizing and the groups only roughly follow words: "1990" becomes two
// groups, "that the" merges into one. So phonemes are used only when the counts
// line up one to one, and characters otherwise, rather than guessing an
// alignment. Measured in the spike, ordinary prose lines up.
//
// charOffset places the sentence inside the request text. Pass null when the
// sentence could not be located; the words then carry no character span and
// the client places them itself (resolveWordSpans in textkit).
export function estimateWordTimestamps(sentence, phonemes, startTime, duration, charOffset) {
  const words = [...sentence.matchAll(/\S+/g)];
  if (words.length === 0) return [];

  const groups = phonemes?.match(/\S+/g) ?? [];
  const byPhonemes = groups.length === words.length;
  const weights = words.map((m, i) =>
    Math.max(byPhonemes ? phonemeWeight(groups[i]) : m[0].length, 1)
  );
  const total = weights.reduce((sum, w) => sum + w, 0);

  let elapsed = startTime;
  return words.map((m, i) => {
    const share = (weights[i] / total) * duration;
    const ts = {
      word: m[0],
      start: elapsed,
      end: elapsed + share,
      start_char: charOffset == null ? null : charOffset + m.index,
      end_char: charOffset == null ? null : charOffset + m.index + m[0].length,
    };
    elapsed += share;
    return ts;
  });
}

// Where each sentence Kokoro produced sits in the request text. Searched in
// order from a cursor, so a sentence repeated within one chunk maps to the
// right occurrence. Kokoro's splitter trims, and may normalize whitespace, so a
// miss is possible; it yields null for that sentence rather than a wrong span,
// and the search carries on from where the last hit ended.
export function locateSentences(text, sentences) {
  const collapse = (s) => s.replace(/\s+/g, " ").trim();
  let cursor = 0;
  return sentences.map((sentence) => {
    const target = collapse(sentence);
    if (!target) return null;
    let at = text.indexOf(target, cursor);
    if (at === -1) at = text.indexOf(sentence.trim(), cursor);
    if (at === -1) return null;
    cursor = at + target.length;
    return at;
  });
}

export function concatFloat32(parts) {
  const length = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Float32Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// 16-bit PCM mono WAV — the format the server returns and the player decodes.
export function encodeWav(samples, sampleRate) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

// btoa over a byte array, in slices: String.fromCharCode(...bytes) on a whole
// paragraph of audio exceeds the argument limit.
export function bytesToBase64(bytes) {
  let binary = "";
  const SLICE = 0x8000;
  for (let i = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + SLICE));
  }
  return btoa(binary);
}

// Assembles one request's response from the sentences Kokoro streamed for it.
// `sentences` is [{ text, phonemes, samples }], in order.
export function assembleResponse(requestText, sentences, sampleRate) {
  const offsets = locateSentences(
    requestText,
    sentences.map((s) => s.text)
  );
  const timestamps = [];
  let time = 0;
  sentences.forEach((s, i) => {
    const duration = s.samples.length / sampleRate;
    timestamps.push(...estimateWordTimestamps(s.text, s.phonemes, time, duration, offsets[i]));
    time += duration;
  });
  const audio = concatFloat32(sentences.map((s) => s.samples));
  return {
    audio_base64: bytesToBase64(encodeWav(audio, sampleRate)),
    sample_rate: sampleRate,
    timestamps,
  };
}
