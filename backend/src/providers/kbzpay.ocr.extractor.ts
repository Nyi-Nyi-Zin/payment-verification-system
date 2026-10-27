import { ProviderCode } from "../common/enums/domain.enums";
import { OcrExtraction, ProviderOcrExtractor } from "./provider.contracts";

/** Conservative English-label baseline; uncertain/missing fields always need human review. */
export class KbzpayOcrExtractor implements ProviderOcrExtractor {
  readonly provider = ProviderCode.KBZPAY;
  extract(rawText: string): OcrExtraction {
    const text = rawText
      .replace(/[၀-၉]/g, (digit) => String(digit.charCodeAt(0) - 0x1040))
      .replace(/\r/g, "");
    const capture = (pattern: RegExp) =>
      text.match(pattern)?.[1]?.trim() || null;
    const amountText =
      capture(
        /(?:Transfer\s+Amount|Amount)\s*[:\-]?\s*(?:MMK|Ks)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      ) || capture(/([\d,]+(?:\.\d{1,2})?)\s*(?:MMK|Ks)\b/i);
    const amount =
      amountText && /^\d+(?:\.\d{1,2})?$/.test(amountText.replace(/,/g, ""))
        ? Number(amountText.replace(/,/g, "")).toFixed(2)
        : null;
    const transactionId = capture(
      /(?:Transaction\s*(?:ID|No\.?|Number)|TM\s*Ref\s*No\.?)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9-]{5,})/i,
    );
    let date = capture(/\b(\d{4}-\d{2}-\d{2})\b/);
    const localDate = text.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b/);
    if (!date && localDate)
      date = `${localDate[3]}-${localDate[2]}-${localDate[1]}`;
    const time = capture(/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\b/i);
    const sender = capture(/(?:Sender\s*Name|From)\s*[:\-]\s*([^\n]+)/i);
    const receiver = capture(
      /(?:Receiver\s*Name|Recipient|To)\s*[:\-]\s*([^\n]+)/i,
    );
    return {
      provider: /KBZ\s*Pay/i.test(text) ? this.provider : null,
      transactionStatus: /\b(?:successful|success|completed)\b/i.test(text)
        ? "COMPLETED"
        : null,
      direction: "UNKNOWN",
      rawText,
      amount,
      currency: amount ? "MMK" : null,
      transactionId,
      date,
      time,
      sender,
      receiver,
      senderPhone: capture(/Sender\s*Phone\s*[:\-]?\s*([+\d]+)/i),
      receiverPhone: capture(
        /(?:Receiver|Recipient)\s*Phone\s*[:\-]?\s*([+\d]+)/i,
      ),
      fieldConfidence: {
        amount: amount ? 0.7 : 0,
        transactionId: transactionId ? 0.7 : 0,
      },
      overallConfidence: null,
    };
  }
}
