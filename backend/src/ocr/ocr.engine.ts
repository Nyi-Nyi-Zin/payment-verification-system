import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface OcrEngineResult {
  text: string;
  engine: string;
  engineVersion: string;
}

export interface OcrEnginePort {
  extractText(image: Buffer): Promise<OcrEngineResult>;
}

interface VisionResponse {
  error?: VisionError;
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
    error?: VisionError;
  }>;
}

interface VisionError {
  code?: number;
  status?: string;
  details?: Array<{ reason?: string }>;
}

/** Stable diagnostic codes; never store provider messages, API keys or request URLs. */
export class OcrServiceError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = "OcrServiceError";
  }
}

function failureCode(
  error: VisionError | undefined,
  httpStatus: number,
): string {
  const reasons = error?.details?.map((detail) => detail.reason) || [];
  if (reasons.includes("BILLING_DISABLED")) return "OCR_BILLING_DISABLED";
  if (reasons.includes("SERVICE_DISABLED") || reasons.includes("API_DISABLED"))
    return "OCR_API_DISABLED";
  if (
    reasons.includes("API_KEY_INVALID") ||
    error?.status === "UNAUTHENTICATED" ||
    httpStatus === 401
  )
    return "OCR_KEY_INVALID";
  if (
    error?.status === "RESOURCE_EXHAUSTED" ||
    error?.code === 8 ||
    httpStatus === 429
  )
    return "OCR_QUOTA_EXCEEDED";
  if (
    error?.status === "PERMISSION_DENIED" ||
    error?.code === 7 ||
    httpStatus === 403
  )
    return "OCR_ACCESS_DENIED";
  if (
    error?.status === "INVALID_ARGUMENT" ||
    error?.code === 3 ||
    httpStatus === 400
  )
    return "OCR_INVALID_IMAGE";
  return "OCR_FAILED";
}

@Injectable()
export class GoogleVisionOcrEngine implements OcrEnginePort {
  private readonly apiKey: string;
  private readonly engineVersion: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>("ocr.googleVisionApiKey") ?? "";
    this.engineVersion =
      config.get<string>("ocr.engineVersion") ??
      "google-vision-text-detection-v1";
  }

  async extractText(image: Buffer): Promise<OcrEngineResult> {
    if (!this.apiKey) {
      throw new OcrServiceError("OCR_NOT_CONFIGURED");
    }

    let response: Response;
    try {
      response = await fetch(
        "https://vision.googleapis.com/v1/images:annotate",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
          },
          body: JSON.stringify({
            requests: [
              {
                image: { content: image.toString("base64") },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                imageContext: { languageHints: ["my", "en"] },
              },
            ],
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch (error) {
      throw new OcrServiceError(
        error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
          ? "OCR_TIMEOUT"
          : "OCR_NETWORK_ERROR",
      );
    }
    const payload = (await response.json().catch(() => ({}))) as VisionResponse;
    const first = payload.responses?.[0];
    if (!response.ok || payload.error || !first || first.error) {
      throw new OcrServiceError(
        failureCode(payload.error || first?.error, response.status),
      );
    }

    const text =
      first.fullTextAnnotation?.text ??
      first.textAnnotations?.[0]?.description ??
      "";
    if (!text.trim()) {
      throw new OcrServiceError("OCR_NO_TEXT");
    }

    return {
      text,
      engine: "google-vision",
      engineVersion: this.engineVersion,
    };
  }
}
