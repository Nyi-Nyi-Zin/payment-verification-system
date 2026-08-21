import {
  OcrExtraction,
  ProviderOcrExtractor,
  TransactionDirection,
} from './provider.contracts';
import { ProviderCode } from '../common/enums/domain.enums';

export class AyapayOcrExtractor implements ProviderOcrExtractor {
  readonly provider = ProviderCode.AYAPAY;

  extract(rawText: string): OcrExtraction {
    const text = rawText.replace(/\r/g, '');
    const transactionId = this.capture(text, /Transaction\s+Code\s*[:\-]?\s*(\d{8,})/i);
    const transactionStatus = this.capture(
      text,
      /Transaction\s+Status\s*[:\-]?\s*([A-Za-z]+)/i,
    );
    const transactionType = this.capture(
      text,
      /Transaction\s+Type\s*[:\-]?\s*(.+?)(?=Transaction\s+Code|$)/is,
    );
    const dateTime = this.capture(
      text,
      /Date\s+and\s+Time\s*[:\-]?\s*(\d{1,2}\s+\w+\s+\d{4},\s+\d{1,2}:\d{2}\s+[AP]M)/i,
    );
    const sender = this.capture(text, /Sender\s+Name\s*[:\-]?\s*(.+)/i);
    const senderPhone = this.capture(text, /Sender\s+Phone\s*[:\-]?\s*([+\d]+)/i);
    const receiver = this.capture(text, /Receiver\s+Name\s*[:\-]?\s*(.+)/i);
    const receiverPhone = this.capture(text, /Receiver\s+Phone\s*[:\-]?\s*([+\d]+)/i);
    const amount = this.capture(text, /Amount\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)\s*MMK/i);
    const total = this.capture(text, /Total\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)\s*MMK/i);
    const notes = this.capture(text, /Notes\s*[:\-]?\s*(.+)/i);
    const currency = amount || total ? 'MMK' : null;

    const fieldConfidence: Record<string, number> = {
      provider: /AYA\s*PAY/i.test(text) ? 0.99 : 0,
      transactionId: transactionId ? 0.98 : 0,
      transactionStatus: transactionStatus ? 0.95 : 0,
      dateTime: dateTime ? 0.95 : 0,
      sender: sender ? 0.9 : 0,
      receiver: receiver ? 0.9 : 0,
      amount: amount ? 0.98 : 0,
    };
    const available = Object.values(fieldConfidence).filter((value) => value > 0);
    const overallConfidence = available.length
      ? available.reduce((sum, value) => sum + value, 0) / available.length
      : 0;

    const direction: TransactionDirection = 'UNKNOWN';

    return {
      provider: /AYA\s*PAY/i.test(text) ? ProviderCode.AYAPAY : null,
      transactionStatus: transactionStatus?.toUpperCase() ?? null,
      direction,
      rawText: text,
      amount: amount ? this.normalizeAmount(amount) : null,
      currency,
      transactionId: transactionId ?? null,
      date: dateTime ? this.parseDate(dateTime) : null,
      time: dateTime ? this.parseTime(dateTime) : null,
      sender: sender ? this.cleanLine(sender) : null,
      senderPhone: senderPhone ?? null,
      receiver: receiver ? this.cleanLine(receiver) : null,
      receiverPhone: receiverPhone ?? null,
      fieldConfidence,
      overallConfidence,
      ...(transactionType ? { transactionType } : {}),
      ...(total ? { totalAmount: this.normalizeAmount(total) } : {}),
      ...(notes ? { notes: this.cleanLine(notes) } : {}),
    } as OcrExtraction;
  }

  private capture(text: string, pattern: RegExp): string | null {
    return text.match(pattern)?.[1]?.trim() ?? null;
  }

  private cleanLine(value: string): string {
    return value.split('\n')[0].trim();
  }

  private normalizeAmount(value: string): string {
    return Number.parseFloat(value.replace(/,/g, '')).toFixed(2);
  }

  private parseDate(value: string): string | null {
    const match = value.match(/^(\d{1,2})\s+(\w+)\s+(\d{4}),/);
    if (!match) return null;
    const [, day, monthName, year] = match;
    const month = new Date(`${monthName} 1, 2000`).getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }

  private parseTime(value: string): string | null {
    return value.match(/,\s+(\d{1,2}:\d{2}\s+[AP]M)$/i)?.[1] ?? null;
  }
}
