import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OcrEngineResult {
  text: string;
  engine: string;
  engineVersion: string;
}

export interface OcrEnginePort {
  extractText(image: Buffer): Promise<OcrEngineResult>;
}

interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
    error?: { message?: string };
  }>;
}

@Injectable()
export class GoogleVisionOcrEngine implements OcrEnginePort {
  private readonly apiKey: string;
  private readonly engineVersion: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ocr.googleVisionApiKey') ?? '';
    this.engineVersion =
      config.get<string>('ocr.engineVersion') ?? 'google-vision-text-detection-v1';
  }

  async extractText(image: Buffer): Promise<OcrEngineResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Google Vision OCR is not configured');
    }

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString('base64') },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const payload = (await response.json()) as VisionResponse;
    const first = payload.responses?.[0];
    if (!response.ok || !first || first.error) {
      throw new Error(first?.error?.message ?? `Google Vision failed with HTTP ${response.status}`);
    }

    const text =
      first.fullTextAnnotation?.text ?? first.textAnnotations?.[0]?.description ?? '';
    if (!text.trim()) {
      throw new Error('Google Vision returned no text');
    }

    return {
      text,
      engine: 'google-vision',
      engineVersion: this.engineVersion,
    };
  }
}
