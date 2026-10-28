import { ConfigService } from "@nestjs/config";
import { GoogleVisionOcrEngine, OcrServiceError } from "../src/ocr/ocr.engine";

describe("Google Vision diagnostics", () => {
  const engine = () =>
    new GoogleVisionOcrEngine(
      new ConfigService({ ocr: { googleVisionApiKey: "private-test-key" } }),
    );
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["BILLING_DISABLED", 403, "OCR_BILLING_DISABLED"],
    ["SERVICE_DISABLED", 403, "OCR_API_DISABLED"],
    ["API_KEY_INVALID", 400, "OCR_KEY_INVALID"],
    ["API_KEY_SERVICE_BLOCKED", 403, "OCR_ACCESS_DENIED"],
    ["", 429, "OCR_QUOTA_EXCEEDED"],
  ])(
    "reports %s without exposing credentials or provider messages",
    async (reason, status, code) => {
      jest.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "Provider message containing private-test-key",
              details: [{ reason }],
            },
          }),
          { status },
        ),
      );
      await expect(
        engine().extractText(Buffer.from("synthetic")),
      ).rejects.toMatchObject({ reasonCode: code, message: code });
    },
  );

  it("handles per-image Google errors as well as HTTP errors", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ responses: [{ error: { code: 7 } }] })),
      );
    await expect(
      engine().extractText(Buffer.from("synthetic")),
    ).rejects.toMatchObject({ reasonCode: "OCR_ACCESS_DENIED" });
  });

  it.each([
    [new TypeError("fetch failed"), "OCR_NETWORK_ERROR"],
    [
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      "OCR_TIMEOUT",
    ],
  ])("classifies network/timeout failures", async (error, code) => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(error);
    await expect(
      engine().extractText(Buffer.from("synthetic")),
    ).rejects.toMatchObject({ reasonCode: code });
  });

  it("distinguishes no readable text from service configuration failures", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ responses: [{}] })));
    await expect(
      engine().extractText(Buffer.from("synthetic")),
    ).rejects.toMatchObject({ reasonCode: "OCR_NO_TEXT" });
  });

  it("keeps keys out of the URL and supplies Myanmar/English language hints", async () => {
    const fetch = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            responses: [
              { fullTextAnnotation: { text: "KBZPay synthetic text" } },
            ],
          }),
        ),
      );
    expect((await engine().extractText(Buffer.from("synthetic"))).text).toBe(
      "KBZPay synthetic text",
    );
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://vision.googleapis.com/v1/images:annotate");
    expect(options?.headers).toMatchObject({
      "X-Goog-Api-Key": "private-test-key",
    });
    expect(
      JSON.parse(options?.body as string).requests[0].imageContext
        .languageHints,
    ).toEqual(["my", "en"]);
  });

  it("rejects missing configuration before making a network request", async () => {
    const fetch = jest.spyOn(globalThis, "fetch");
    const unconfigured = new GoogleVisionOcrEngine(new ConfigService());
    await expect(
      unconfigured.extractText(Buffer.from("synthetic")),
    ).rejects.toBeInstanceOf(OcrServiceError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
