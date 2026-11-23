// Covers extension/lib/record.js, the page's sentence record (000053): the
// order sentences are synthesized in, the cap on kept audio, and the states.
const test = require("node:test");
const assert = require("node:assert/strict");
const Record = require("../extension/lib/record.js");

const audio = (bytes) => ({ audio_base64: "A".repeat(bytes), timestamps: [] });

// Runs the synthesis loop content.js runs, one request at a time, and returns
// the order sentences were made in. `onStore` may move the reader.
function synthesizeAll(record, { bytes = 10, onStore = () => {}, limit = 1000 } = {}) {
  const order = [];
  for (let n = 0; n < limit; n++) {
    const i = record.next();
    if (i === -1) break;
    record.start(i);
    record.store(i, audio(bytes));
    order.push(i);
    onStore(i);
  }
  return order;
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

test("the order sentences are synthesized in", async (t) => {
  await t.test("forward from the start, one after another", () => {
    const record = Record.create(5);
    assert.deepEqual(synthesizeAll(record), [0, 1, 2, 3, 4]);
  });

  await t.test("after a jump: the target to the end, then the gap (Umut's example)", () => {
    // Sentences 1..100 are indices 0..99. Read from 1, made up to 8, jump to 20.
    const record = Record.create(100);
    synthesizeAll(record, { limit: 8 });
    record.setCursor(19);
    assert.deepEqual(synthesizeAll(record), [...range(19, 99), ...range(8, 18)]);
  });

  await t.test("a second jump mid-way changes course at once", () => {
    const record = Record.create(30);
    record.setCursor(10);
    const order = synthesizeAll(record, {
      onStore: (i) => i === 12 && record.setCursor(25),
    });
    assert.deepEqual(order, [10, 11, 12, ...range(25, 29), ...range(0, 9), ...range(13, 24)]);
  });

  await t.test("a jump back to made sentences goes on from the first one missing", () => {
    const record = Record.create(10);
    synthesizeAll(record, { limit: 6 });
    record.setCursor(2);
    assert.equal(record.next(), 6);
  });

  await t.test("skips a sentence already being made", () => {
    const record = Record.create(3);
    record.start(0);
    assert.equal(record.next(), 1);
  });

  await t.test("nothing left once the whole page is made", () => {
    const record = Record.create(3);
    synthesizeAll(record);
    assert.equal(record.next(), -1);
  });
});

test("the states of a sentence", async (t) => {
  await t.test("none, synthesizing, ready, played", () => {
    const record = Record.create(1);
    assert.equal(record.state(0), Record.NONE);
    record.start(0);
    assert.equal(record.state(0), Record.SYNTHESIZING);
    record.store(0, audio(5));
    assert.equal(record.state(0), Record.READY);
    record.markPlayed(0);
    assert.equal(record.state(0), Record.PLAYED);
  });

  await t.test("a played sentence keeps its audio, so going back needs no synthesis", () => {
    const record = Record.create(2);
    const made = audio(5);
    record.store(0, made);
    record.markPlayed(0);
    assert.equal(record.has(0), true);
    assert.equal(record.get(0), made);
  });

  await t.test("a failure puts it back to be made again", () => {
    const record = Record.create(2);
    record.start(0);
    record.fail(0, new Error("down"));
    assert.equal(record.state(0), Record.NONE);
    assert.equal(record.next(), 0);
  });

  await t.test("only a sentence with audio can be marked played", () => {
    const record = Record.create(1);
    record.markPlayed(0);
    assert.equal(record.state(0), Record.NONE);
  });

  await t.test("the summary counts each state", () => {
    const record = Record.create(4);
    record.store(0, audio(1));
    record.markPlayed(0);
    record.store(1, audio(1));
    record.start(2);
    assert.deepEqual(record.summary(), { none: 1, synthesizing: 1, ready: 1, played: 1 });
  });
});

test("waiting for a sentence", async (t) => {
  await t.test("resolves at once when it is already made", async () => {
    const record = Record.create(1);
    const made = audio(3);
    record.store(0, made);
    assert.equal(await record.whenReady(0), made);
  });

  await t.test("resolves when it is stored", async () => {
    const record = Record.create(1);
    const waiting = record.whenReady(0);
    const made = audio(3);
    record.store(0, made);
    assert.equal(await waiting, made);
  });

  await t.test("rejects when its synthesis fails", async () => {
    const record = Record.create(1);
    const waiting = record.whenReady(0);
    record.start(0);
    record.fail(0, new Error("server down"));
    await assert.rejects(waiting, /server down/);
  });

  await t.test("rejects when the record is cleared, as on a voice change", async () => {
    const record = Record.create(2);
    record.store(0, audio(3));
    const waiting = record.whenReady(1);
    record.clear("voice changed");
    await assert.rejects(waiting, /voice changed/);
    assert.equal(record.has(0), false);
    assert.equal(record.usedBytes, 0);
    assert.equal(record.next(), 0);
  });
});

test("the cap on kept audio", async (t) => {
  await t.test("drops passed sentences, oldest first, to make room ahead", () => {
    const record = Record.create(10, { capBytes: 30 });
    synthesizeAll(record, { limit: 3 }); // 0, 1, 2: full
    record.setCursor(3);
    record.start(3);
    const dropped = record.store(3, audio(10));
    assert.deepEqual(dropped, [0]);
    assert.equal(record.has(0), false);
    assert.equal(record.has(1), true);
    assert.equal(record.usedBytes, 30);
  });

  await t.test("never drops the sentence being read or anything ahead of it", () => {
    const record = Record.create(10, { capBytes: 30 });
    record.setCursor(0);
    synthesizeAll(record);
    for (const i of [0, 1, 2]) assert.equal(record.has(i), true);
    // Full, and nothing behind the reader to drop: synthesis waits.
    assert.equal(record.next(), -1);
  });

  await t.test("resumes when the reader moves on and passed audio can go", () => {
    const record = Record.create(10, { capBytes: 30 });
    synthesizeAll(record);
    record.setCursor(1);
    assert.equal(record.next(), 3);
  });

  await t.test("filling a gap never drops anything, so it cannot churn", () => {
    // Made 5..9 after a jump; the gap 0..4 is filled only while there is room.
    const record = Record.create(10, { capBytes: 70 });
    record.setCursor(5);
    const order = synthesizeAll(record);
    assert.deepEqual(order, [5, 6, 7, 8, 9, 0, 1]);
    assert.equal(record.next(), -1);
    for (const i of range(5, 9)) assert.equal(record.has(i), true);
  });

  await t.test("a whole page that fits is kept whole", () => {
    const record = Record.create(20, { capBytes: 1000 });
    synthesizeAll(record);
    assert.deepEqual(record.summary(), { none: 0, synthesizing: 0, ready: 20, played: 0 });
  });
});
