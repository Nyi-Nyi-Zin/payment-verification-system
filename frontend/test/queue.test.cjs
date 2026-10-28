const { test } = require("node:test");
const assert = require("node:assert/strict");
const modules = Promise.all([
  import("../src/lib/queue.ts"),
  import("../src/lib/i18n.ts"),
]);
const file = (name = "receipt.png", size = 10, type = "image/png") => ({
  name,
  size,
  type,
});
const result = (id, status = "VERIFIED", extra = {}) => ({
  screenshotId: id,
  status,
  ...extra,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settle = async (predicate) => {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Queue did not reach expected state");
};

test("accepts supported files and rejects empty, oversized and unsupported input", async () => {
  const [{ validateReceipt, MAX_FILE_BYTES }] = await modules;
  assert.equal(validateReceipt(file()), null);
  assert.equal(
    validateReceipt(file("PHOTO.JPEG", MAX_FILE_BYTES, "image/jpeg")),
    null,
  );
  assert.equal(validateReceipt(file("receipt.webp", 10, "image/webp")), null);
  assert.equal(validateReceipt(file("empty.png", 0)), "EMPTY_FILE");
  assert.equal(
    validateReceipt(file("big.png", MAX_FILE_BYTES + 1)),
    "FILE_TOO_LARGE",
  );
  assert.equal(
    validateReceipt(file("not-a-receipt.pdf", 10, "application/pdf")),
    "FILE_TYPE",
  );
});

test("same-image attempts remain Duplicate even when the original receipt is Match", async () => {
  const [{ ReceiptQueue, outcome, retryable }] = await modules;
  const q = new ReceiptQueue({
    upload: async () => result("original", "VERIFIED", { duplicate: true }),
    recheck: () => assert.fail("A duplicate must not be reprocessed"),
  });
  q.add([file()]);
  await q.run();
  assert.equal(outcome(q.items[0]), "DUPLICATE");
  assert.equal(retryable(q.items[0]), false);
  assert.equal(q.items[0].result.status, "VERIFIED");
});

test("requests are sequential, including repeated start clicks", async () => {
  const [{ ReceiptQueue }] = await modules;
  const active = deferred();
  const seen = [];
  const q = new ReceiptQueue({
    upload: async (f) => {
      seen.push(f.name);
      if (seen.length === 1) await active.promise;
      return result(f.name);
    },
  });
  q.add([file("one.png"), file("two.png")]);
  const run = q.run();
  await q.run();
  await settle(() => seen.length === 1);
  assert.deepEqual(seen, ["one.png"]);
  active.resolve();
  await run;
  assert.deepEqual(seen, ["one.png", "two.png"]);
  assert.deepEqual(q.progress, { done: 2, total: 2 });
});

test("payment duplicates can be checked again after the original is deleted", async () => {
  const [{ ReceiptQueue, outcome, retryable }] = await modules;
  for (const duplicate of [false, true]) {
    const q = new ReceiptQueue({
      upload: async () => result("blocked", "DUPLICATE", { duplicate }),
      recheck: async (id) => result(id, "VERIFIED"),
    });
    q.add([file()]);
    await q.run();
    assert.equal(retryable(q.items[0]), true);
    await q.retry(q.items[0].id);
    assert.equal(outcome(q.items[0]), "VERIFIED");
    assert.equal(retryable(q.items[0]), false);
  }
});

test("pause finishes the active file and resume processes only the remaining files", async () => {
  const [{ ReceiptQueue }] = await modules;
  const active = deferred();
  const seen = [];
  const q = new ReceiptQueue({
    upload: async (f) => {
      seen.push(f.name);
      if (seen.length === 1) await active.promise;
      return result(f.name);
    },
  });
  q.add([file("one.png"), file("two.png"), file("three.png")]);
  const run = q.run();
  await settle(() => seen.length === 1);
  q.pause();
  active.resolve();
  await run;
  assert.equal(q.paused, true);
  assert.equal(q.pending, 2);
  assert.equal(q.hasUnfinished, true);
  assert.deepEqual(seen, ["one.png"]);
  await q.run();
  assert.deepEqual(seen, ["one.png", "two.png", "three.png"]);
  assert.equal(q.hasUnfinished, false);
});

test("one failed request does not discard later files or their dates", async () => {
  const [{ ReceiptQueue, outcome }] = await modules;
  const q = new ReceiptQueue({
    upload: async (f) => {
      if (f.name === "bad.png") throw { code: "NETWORK_ERROR" };
      return result(f.name, "VERIFIED", {
        businessDate: f.name === "one.png" ? "2026-10-26" : "2026-10-27",
      });
    },
  });
  q.add([file("one.png"), file("bad.png"), file("two.png")]);
  await q.run();
  assert.deepEqual(q.items.map(outcome), ["VERIFIED", "FAILED", "VERIFIED"]);
  assert.deepEqual(
    q.items.filter((i) => i.result).map((i) => i.result.businessDate),
    ["2026-10-26", "2026-10-27"],
  );
});

test("OCR retry uses the saved screenshot ID and does not upload a new receipt", async () => {
  const [{ ReceiptQueue }] = await modules;
  let uploads = 0;
  const ids = [];
  const q = new ReceiptQueue({
    upload: async () => {
      uploads++;
      return result("saved", "FAILED", { reasonCode: "OCR_FIELDS_INCOMPLETE" });
    },
    recheck: async (id) => {
      ids.push(id);
      return result(id);
    },
  });
  q.add([file()]);
  await q.run();
  assert.equal(q.items[0].file, null);
  await q.retry(q.items[0].id);
  assert.equal(uploads, 1);
  assert.deepEqual(ids, ["saved"]);
  assert.equal(q.items[0].result.status, "VERIFIED");
});

test("network retry keeps the original file and does not drain a paused queue", async () => {
  const [{ ReceiptQueue }] = await modules;
  let calls = 0;
  const q = new ReceiptQueue({
    upload: async () => {
      if (++calls === 1) throw { code: "NETWORK_ERROR" };
      return result("retried");
    },
  });
  q.add([file()]);
  await q.run();
  assert.ok(q.items[0].file);
  q.add([file("later.png")]);
  await q.retry(q.items[0].id);
  assert.equal(calls, 2);
  assert.equal(q.pending, 1);
  assert.equal(q.items[1].phase, "queued");
});

test("unsubmitted files can be removed; saved rows are discarded only after server deletion", async () => {
  const [{ ReceiptQueue }] = await modules;
  const q = new ReceiptQueue({ upload: async () => result("saved") });
  q.add([file(), file("bad.pdf")]);
  const validId = q.items[0].id,
    badId = q.items[1].id;
  q.remove(badId);
  await q.run();
  q.remove(validId);
  assert.equal(q.items.length, 1);
  assert.equal(q.items[0].result.screenshotId, "saved");
  q.discardScreenshot("saved");
  assert.equal(q.items.length, 0);
});

test("expired sessions stop further uploads and abandoned sessions never notify a new session", async () => {
  const [{ ReceiptQueue }] = await modules;
  let calls = 0;
  const q = new ReceiptQueue({
    upload: async () => {
      calls++;
      throw { code: "SESSION_EXPIRED" };
    },
  });
  q.add([file("one.png"), file("two.png")]);
  await q.run();
  assert.equal(calls, 1);
  assert.equal(q.pending, 1);
  const active = deferred();
  let notifications = 0;
  const q2 = new ReceiptQueue({
    upload: async () => {
      await active.promise;
      return result("old");
    },
    onChange: () => notifications++,
  });
  q2.add([file(), file("later.png")]);
  const run = q2.run();
  await settle(() => q2.items[0].phase === "uploading");
  q2.abandon();
  const before = notifications;
  active.resolve();
  await run;
  assert.equal(notifications, before);
  assert.equal(q2.hasUnfinished, false);
  assert.equal(q2.items[1].file, null);
});

test("English and Myanmar translations cover exactly the same keys and interpolate safely", async () => {
  const [, { messages, translate }] = await modules;
  assert.deepEqual(
    Object.keys(messages.my).sort(),
    Object.keys(messages.en).sort(),
  );
  assert.equal(
    translate("en", "checking", { number: 3, total: 10 }),
    "Checking 3 of 10",
  );
  assert.ok(
    translate("my", "checking", { number: 3, total: 10 }).includes("10"),
  );
  assert.ok(
    Object.values(messages.my).every(
      (value) =>
        typeof value === "string" &&
        value.trim().length &&
        !/[\uFFFD]|\?{3,}/.test(value),
    ),
  );
});
