import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GoogleVisionOcrEngine,
  OcrEnginePort,
  OcrServiceError,
} from "./ocr.engine";
import { TesseractOcrEngine } from "./tesseract.engine";

@Injectable()
export class ReceiptOcrEngine implements OcrEnginePort {
  constructor(
    private readonly config: ConfigService,
    private readonly local: TesseractOcrEngine,
    private readonly google: GoogleVisionOcrEngine,
  ) {}

  get driver(): string {
    return this.config.get<string>("ocr.driver") || "tesseract";
  }

  isConfigured(): boolean {
    if (this.driver === "tesseract") return this.local.isConfigured();
    if (this.driver === "google-vision")
      return !!this.config.get<string>("ocr.googleVisionApiKey");
    return false;
  }

  async extractText(image: Buffer) {
    if (this.driver === "tesseract") return this.local.extractText(image);
    if (this.driver === "google-vision") {
      if (!this.isConfigured()) throw new OcrServiceError("OCR_NOT_CONFIGURED");
      return this.google.extractText(image);
    }
    throw new OcrServiceError("OCR_DRIVER_INVALID");
  }
}
