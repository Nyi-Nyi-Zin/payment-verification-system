import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createWorker, OEM, PSM, Worker } from "tesseract.js";
import { OcrEnginePort, OcrEngineResult, OcrServiceError } from "./ocr.engine";

@Injectable()
export class TesseractOcrEngine implements OcrEnginePort, OnModuleDestroy {
  private worker?: Promise<Worker>;
  private queue: Promise<void> = Promise.resolve();
  private queued = 0;
  private closing = false;
  private readonly modelDirectory: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.modelDirectory = resolve(
      config.get<string>("ocr.tesseractDataDir") || "./data/tessdata",
    );
    const configuredTimeout = Number(config.get("ocr.localTimeoutMs") ?? 60000);
    this.timeoutMs = Number.isFinite(configuredTimeout)
      ? Math.min(120000, Math.max(1000, configuredTimeout))
      : 60000;
  }

  isConfigured(): boolean {
    try {
      return ["eng", "mya"].every((language) => {
        const model = statSync(
          join(this.modelDirectory, `${language}.traineddata`),
        );
        return model.isFile() && model.size > 0;
      });
    } catch {
      return false;
    }
  }

  async extractText(image: Buffer): Promise<OcrEngineResult> {
    if (this.closing || this.queued >= 8)
      throw new OcrServiceError("OCR_LOCAL_BUSY");
    this.queued++;
    // One worker processes one receipt at a time; concurrent requests cannot mix text.
    const job = this.queue.then(() => this.recognize(image));
    this.queue = job.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await job;
    } finally {
      this.queued--;
    }
  }

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = createWorker(["eng", "mya"], OEM.LSTM_ONLY, {
        // Absolute local paths and disabled cache downloads keep runtime OCR offline.
        workerPath: join(__dirname, "tesseract.worker.js"),
        langPath: this.modelDirectory,
        gzip: false,
        cacheMethod: "none",
        errorHandler: () => undefined,
      }).then(async (worker) => {
        try {
          await worker.setParameters({
            // Receipt cards contain isolated columns, logos and footer text.
            // AUTO can discard the KBZPay footer or read all labels before values.
            tessedit_pageseg_mode: PSM.SPARSE_TEXT,
            user_defined_dpi: "300",
            preserve_interword_spaces: "1",
          });
          return worker;
        } catch (error) {
          await worker.terminate();
          throw error;
        }
      });
    }
    return this.worker;
  }

  private async recognize(image: Buffer): Promise<OcrEngineResult> {
    if (!this.isConfigured())
      throw new OcrServiceError("OCR_LOCAL_MODELS_MISSING");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.getWorker().then((worker) => worker.recognize(image)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new OcrServiceError("OCR_TIMEOUT")),
            this.timeoutMs,
          );
        }),
      ]);
      if (!result.data.text.trim()) throw new OcrServiceError("OCR_NO_TEXT");
      return {
        text: result.data.text,
        engine: "tesseract-local",
        engineVersion: "tesseract.js-7.0.0/eng+mya-best-e12c65a9/sparse",
      };
    } catch (error) {
      if (
        !(error instanceof OcrServiceError) ||
        error.reasonCode === "OCR_TIMEOUT"
      )
        this.resetWorker();
      throw error instanceof OcrServiceError
        ? error
        : new OcrServiceError("OCR_LOCAL_FAILED");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private resetWorker(): void {
    const worker = this.worker;
    this.worker = undefined;
    void worker
      ?.then((instance) => instance.terminate())
      .catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    await this.queue;
    const worker = this.worker;
    this.worker = undefined;
    if (worker)
      await worker
        .then((instance) => instance.terminate())
        .catch(() => undefined);
  }
}
