import { Global, Module } from '@nestjs/common';
import { GoogleVisionOcrEngine } from './ocr.engine';

@Global()
@Module({
  providers: [GoogleVisionOcrEngine],
  exports: [GoogleVisionOcrEngine],
})
export class OcrModule {}
