import { ConfigService } from "@nestjs/config";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorker, Worker } from "tesseract.js";
import { TesseractOcrEngine } from "../src/ocr/tesseract.engine";
import { ReceiptOcrEngine } from "../src/ocr/receipt-ocr.engine";
import { GoogleVisionOcrEngine, OcrServiceError } from "../src/ocr/ocr.engine";

jest.mock("tesseract.js", () => ({
  createWorker: jest.fn(),
  OEM: { LSTM_ONLY: 1 },
  PSM: { SPARSE_TEXT: "11" },
}));

describe("Local Tesseract OCR", () => {
  let directory: string;
  let engine: TesseractOcrEngine;
  let worker: {
    recognize: jest.Mock;
    setParameters: jest.Mock;
    terminate: jest.Mock;
  };
  beforeEach(() => {
    jest.clearAllMocks();
    directory = mkdtempSync(join(tmpdir(), "tesseract-unit-"));
    for (const language of ["eng", "mya"])
      writeFileSync(join(directory, `${language}.traineddata`), "mock-model");
    worker = {
      recognize: jest.fn(async (image: Buffer) => ({
        data: { text: image.toString() },
      })),
      setParameters: jest.fn().mockResolvedValue({}),
      terminate: jest.fn().mockResolvedValue({}),
    };
    jest.mocked(createWorker).mockResolvedValue(worker as unknown as Worker);
    engine = new TesseractOcrEngine(
      new ConfigService({
        ocr: { tesseractDataDir: directory, localTimeoutMs: 1000 },
      }),
    );
  });
  afterEach(async () => {
    await engine.onModuleDestroy();
    jest.useRealTimers();
    for (const language of ["eng", "mya"]) {
      try {
        unlinkSync(join(directory, `${language}.traineddata`));
      } catch {
        /* A missing-model test removes it first. */
      }
    }
    rmdirSync(directory);
  });

  it("reuses a worker with only absolute local models and no download/cache fallback", async () => {
    expect(engine.isConfigured()).toBe(true);
    expect(await engine.extractText(Buffer.from("receipt A"))).toMatchObject({
      text: "receipt A",
      engine: "tesseract-local",
      engineVersion: "tesseract.js-7.0.0/eng+mya-best-e12c65a9/sparse",
    });
    expect((await engine.extractText(Buffer.from("receipt B"))).text).toBe(
      "receipt B",
    );
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(createWorker).toHaveBeenCalledWith(
      ["eng", "mya"],
      1,
      expect.objectContaining({
        workerPath: expect.stringMatching(/tesseract\.worker\.js$/),
        langPath: directory,
        gzip: false,
        cacheMethod: "none",
      }),
    );
    expect(worker.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({ tessedit_pageseg_mode: "11" }),
    );
  });

  it("reports missing models before creating any worker", async () => {
    unlinkSync(join(directory, "mya.traineddata"));
    expect(engine.isConfigured()).toBe(false);
    await expect(
      engine.extractText(Buffer.from("receipt")),
    ).rejects.toMatchObject({ reasonCode: "OCR_LOCAL_MODELS_MISSING" });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("serializes concurrent jobs without mixing their receipt text", async () => {
    let release!: () => void;
    worker.recognize.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return { data: { text: "first" } };
    });
    const first = engine.extractText(Buffer.from("first"));
    const second = engine.extractText(Buffer.from("second"));
    while (!release) await Promise.resolve();
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    release();
    expect((await first).text).toBe("first");
    expect((await second).text).toBe("second");
  });

  it("bounds the number of pending receipts", async () => {
    let release!: () => void;
    worker.recognize.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return { data: { text: "first" } };
    });
    const jobs = Array.from({ length: 8 }, () =>
      engine.extractText(Buffer.from("receipt")),
    );
    await expect(
      engine.extractText(Buffer.from("ninth")),
    ).rejects.toMatchObject({ reasonCode: "OCR_LOCAL_BUSY" });
    while (!release) await Promise.resolve();
    release();
    await Promise.all(jobs);
  });

  it("reports an empty image result separately from a worker failure", async () => {
    worker.recognize.mockResolvedValueOnce({ data: { text: " " } });
    await expect(
      engine.extractText(Buffer.from("receipt")),
    ).rejects.toMatchObject({ reasonCode: "OCR_NO_TEXT" });
    worker.recognize.mockRejectedValueOnce(new Error("private native error"));
    await expect(
      engine.extractText(Buffer.from("receipt")),
    ).rejects.toMatchObject({
      reasonCode: "OCR_LOCAL_FAILED",
      message: "OCR_LOCAL_FAILED",
    });
  });

  it("terminates and replaces a timed-out worker", async () => {
    jest.useFakeTimers();
    worker.recognize.mockImplementationOnce(() => new Promise(() => undefined));
    const job = engine.extractText(Buffer.from("receipt"));
    const assertion = expect(job).rejects.toMatchObject({
      reasonCode: "OCR_TIMEOUT",
    });
    await jest.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(worker.terminate).toHaveBeenCalled();
    expect((await engine.extractText(Buffer.from("retry"))).text).toBe("retry");
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("defaults to local OCR even when an old Google API key exists", async () => {
    const google = { extractText: jest.fn() };
    const selected = new ReceiptOcrEngine(
      new ConfigService({ ocr: { googleVisionApiKey: "unused-old-key" } }),
      engine,
      google as unknown as GoogleVisionOcrEngine,
    );
    expect(selected.driver).toBe("tesseract");
    expect((await selected.extractText(Buffer.from("receipt"))).engine).toBe(
      "tesseract-local",
    );
    expect(google.extractText).not.toHaveBeenCalled();
  });

  it("never sends a failed local OCR request to a cloud fallback", async () => {
    worker.recognize.mockRejectedValueOnce(new Error("worker failed"));
    const google = { extractText: jest.fn() };
    const selected = new ReceiptOcrEngine(
      new ConfigService(),
      engine,
      google as unknown as GoogleVisionOcrEngine,
    );
    await expect(
      selected.extractText(Buffer.from("receipt")),
    ).rejects.toBeInstanceOf(OcrServiceError);
    expect(google.extractText).not.toHaveBeenCalled();
  });
});
