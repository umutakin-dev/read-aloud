// The page's sentence record (000053): which sentences have audio, which one
// is being made, and what to make next.
//
// Pure bookkeeping, no messaging: content.js asks next() what to synthesize,
// makes one request at a time, and reports back with store() or fail(). Kept
// apart from content.js because the ordering and the cap are the rules that
// matter, and tests/record.test.js checks them directly.
//
// Loaded as a plain script in the extension (defining a global) and as a module
// in Node, like textkit.js.
const ReadAloudRecord = (() => {
  "use strict";

  const NONE = "none";
  const SYNTHESIZING = "synthesizing";
  const READY = "ready";
  const PLAYED = "played";

  // `count` sentences; `capBytes` bounds the audio kept, counted as the length
  // of each sentence's base64.
  function create(count, { capBytes = Infinity } = {}) {
    const states = new Array(count).fill(NONE);
    const audio = new Map(); // index -> { data, bytes, stored }
    const waiters = new Map(); // index -> [{ resolve, reject }]
    let cursor = 0;
    let used = 0;
    let clock = 0; // store order, for "oldest first"

    const hasAudio = (i) => states[i] === READY || states[i] === PLAYED;

    function settle(index, how, value) {
      const list = waiters.get(index);
      if (!list) return;
      waiters.delete(index);
      for (const w of list) w[how](value);
    }

    // Drops sentences the reader has passed, oldest stored first, until the
    // audio fits again. Never one at or ahead of the reader: that is the audio
    // about to be heard.
    function evictBehind() {
      const dropped = [];
      const behind = [...audio.entries()]
        .filter(([i]) => i < cursor)
        .sort((a, b) => a[1].stored - b[1].stored);
      for (const [i, entry] of behind) {
        if (used <= capBytes) break;
        audio.delete(i);
        used -= entry.bytes;
        states[i] = NONE;
        dropped.push(i);
      }
      return dropped;
    }

    return {
      get count() {
        return count;
      },
      get cursor() {
        return cursor;
      },
      get usedBytes() {
        return used;
      },

      state: (i) => states[i],
      has: hasAudio,
      get: (i) => audio.get(i)?.data ?? null,

      // Where the reader is. Synthesis runs forward from here.
      setCursor(i) {
        cursor = Math.max(0, Math.min(i, count));
      },

      // The next sentence to synthesize, or -1 for none right now.
      //
      // Forward from the reader to the end first, then back to fill what was
      // skipped, from the top (Umut, 2026-11-23): read 1 to 8, jump to 20, and
      // the order is 20 to the end, then 9 to 19.
      //
      // When the cap is reached, forward work may still go ahead if there is
      // passed audio to drop for it. Filling a gap never drops anything: its
      // audio would push out other passed audio, which would then be a gap to
      // fill, round and round.
      next() {
        for (let i = cursor; i < count; i++) {
          if (states[i] === NONE) {
            const room = used < capBytes || [...audio.keys()].some((k) => k < cursor);
            return room ? i : -1;
          }
        }
        if (used >= capBytes) return -1;
        for (let i = 0; i < cursor; i++) {
          if (states[i] === NONE) return i;
        }
        return -1;
      },

      start(i) {
        if (states[i] === NONE) states[i] = SYNTHESIZING;
      },

      // Returns the indices dropped to make room, for the debug log.
      store(i, data) {
        if (i < 0 || i >= count) return [];
        const bytes = data?.audio_base64?.length || 0;
        const previous = audio.get(i);
        if (previous) used -= previous.bytes;
        audio.set(i, { data, bytes, stored: clock++ });
        used += bytes;
        if (states[i] !== PLAYED) states[i] = READY;
        settle(i, "resolve", data);
        return i >= cursor ? evictBehind() : [];
      },

      fail(i, error) {
        if (states[i] === SYNTHESIZING) states[i] = NONE;
        settle(i, "reject", error);
      },

      markPlayed(i) {
        if (hasAudio(i)) states[i] = PLAYED;
      },

      // Resolves with the sentence's audio once it is stored; rejects if its
      // synthesis fails or the record is cleared first.
      whenReady(i) {
        if (hasAudio(i)) return Promise.resolve(audio.get(i).data);
        return new Promise((resolve, reject) => {
          if (!waiters.has(i)) waiters.set(i, []);
          waiters.get(i).push({ resolve, reject });
        });
      },

      // Everything made so far is unusable, as after a voice change.
      clear(reason = "cleared") {
        audio.clear();
        used = 0;
        for (let i = 0; i < count; i++) states[i] = NONE;
        for (const i of [...waiters.keys()]) settle(i, "reject", new Error(reason));
      },

      // Counts by state, for the debug log and the progress bar (000040).
      summary() {
        const counts = { none: 0, synthesizing: 0, ready: 0, played: 0 };
        for (const s of states) counts[s]++;
        return counts;
      },
    };
  }

  return { create, NONE, SYNTHESIZING, READY, PLAYED };
})();

// Node sees a module; the extension sees a global.
if (typeof module !== "undefined" && module.exports) {
  module.exports = ReadAloudRecord;
}
