import { Global, Module } from "@nestjs/common";
import { GoogleVisionOcrEngine } from "./ocr.engine";
import { TesseractOcrEngine } from "./tesseract.engine";
import { ReceiptOcrEngine } from "./receipt-ocr.engine";

@Global()
@Module({
  providers: [GoogleVisionOcrEngine, TesseractOcrEngine, ReceiptOcrEngine],
  exports: [ReceiptOcrEngine],
})
export class OcrModule {}
