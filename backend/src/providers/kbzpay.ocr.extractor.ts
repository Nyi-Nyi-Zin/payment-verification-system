import { ProviderCode } from "../common/enums/domain.enums";
import { OcrExtraction, ProviderOcrExtractor } from "./provider.contracts";

/** KBZPay English/Myanmar labels and the numeric E-Receipt layout. */
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
        /(?:Transfer\s+Amount|Amount|ငွေပမာဏ)\s*[:\-]?\s*(?:MMK|Ks)?\s*(-?[\d,]+(?:\.\d{1,2})?)/i,
      ) || capture(/(-?[\d,]+(?:\.\d{1,2})?)\s*(?:MMK|Ks)\b/i);
    const amount =
      amountText && /^-?\d+(?:\.\d{1,2})?$/.test(amountText.replace(/,/g, ""))
        ? // A payer's E-Receipt may show a debit; compare its magnitude with received funds.
          Math.abs(Number(amountText.replace(/,/g, ""))).toFixed(2)
        : null;
    const numericReferences = [
      ...new Set(
        text
          .split("\n")
          .map((line) => line.trim().replace(/[ \t]/g, ""))
          .filter((line) => /^0\d{19}$/.test(line)),
      ),
    ];
    // OCR may read an entire label column before its values. Validate the whole
    // value line so the next label (e.g. "Transaction Type") cannot become an ID.
    const labeledReference = capture(
      /(?:Transaction\s*(?:ID\b|Number\b|No\b\.?)|TM\s*Ref\s*No\.?|လုပ်ဆောင်မှု\s*အမှတ်)\s*[:#\-]?\s*([^\n]+)/i,
    );
    const reference = labeledReference?.replace(/[ \t]/g, "");
    const validReference =
      reference &&
      /\d/.test(reference) &&
      /^[A-Z0-9][A-Z0-9-]{5,}$/i.test(reference) &&
      (!/[ \t]/.test(labeledReference!) || /^0\d{19}$/.test(reference))
        ? reference
        : null;
    const transactionId =
      validReference ||
      (numericReferences.length === 1 ? numericReferences[0] : null);
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
