import {
  OcrExtraction,
  ProviderOcrExtractor,
  TransactionDirection,
} from './provider.contracts';
import { ProviderCode } from '../common/enums/domain.enums';

export class WavepayOcrExtractor implements ProviderOcrExtractor {
  readonly provider = ProviderCode.WAVEPAY;

  extract(rawText: string): OcrExtraction {
    const text = rawText.replace(/\r/g, '');
    const status = this.capture(text, /^\s*(Successful|Success|Failed|Pending)\s*$/im);
    const amount = this.capture(text, /^\s*([\d,]+(?:\.\d{1,2})?)\s*Ks\s*$/im);
    const recipient = this.capture(text, /(?:^|\n)\s*To\s*\n\s*([^\n]+)\s*\n/i);
    const recipientPhone = this.capture(text, /\n\s*(\+?\d{9,12})\s*\n/i);
    const type = this.capture(text, /(?:^|\n)\s*Type\s+[^\n]*\s+([A-Za-z ]+)\s*$/im);
    const fee = this.capture(text, /Fees\s+([\d,]+(?:\.\d{1,2})?)\s*Ks/i);
    const transactionId = this.capture(text, /Transaction\s+ID\s+([A-Za-z0-9-]+)/i);
    const dateTime = this.capture(
      text,
      /Date\s*&\s*Time\s+(\d{1,2}\s+\w+\s+\d{4}\s*[•·]\s*\d{1,2}:\d{2}\s+[AP]M)/i,
    );

    const fieldConfidence: Record<string, number> = {
      provider: /receipt\s+by\s+wave|\bWave\b/i.test(text) ? 0.98 : 0,
      status: status ? 0.99 : 0,
      amount: amount ? 0.98 : 0,
      recipient: recipient ? 0.88 : 0,
      recipientPhone: recipientPhone ? 0.9 : 0,
      transactionId: transactionId ? 0.97 : 0,
      dateTime: dateTime ? 0.95 : 0,
    };
    const available = Object.values(fieldConfidence).filter((value) => value > 0);
    const overallConfidence = available.length
      ? available.reduce((sum, value) => sum + value, 0) / available.length
      : 0;

    return {
      provider: /receipt\s+by\s+wave|\bWave\b/i.test(text)
        ? ProviderCode.WAVEPAY
        : null,
      transactionStatus: status?.toUpperCase() ?? null,
      direction: 'UNKNOWN' as TransactionDirection,
      rawText: text,
      amount: amount ? this.normalizeAmount(amount) : null,
      currency: amount ? 'MMK' : null,
      transactionId: transactionId ?? null,
      date: dateTime ? this.parseDate(dateTime) : null,
      time: dateTime ? this.parseTime(dateTime) : null,
      sender: null,
      senderPhone: null,
      receiver: recipient ? this.cleanLine(recipient) : null,
      receiverPhone: recipientPhone ? this.normalizePhone(recipientPhone) : null,
      transactionType: type ? this.cleanLine(type) : undefined,
      feeAmount: fee ? this.normalizeAmount(fee) : undefined,
      fieldConfidence,
      overallConfidence,
    };
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

  private normalizePhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('959')) return `0${digits.slice(3)}`;
    if (digits.startsWith('9')) return `0${digits}`;
    return digits;
  }

  private parseDate(value: string): string | null {
    const match = value.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})\s*[•·]/);
    if (!match) return null;
    const [, day, monthName, year] = match;
    const month = new Date(`${monthName} 1, 2000`).getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }

  private parseTime(value: string): string | null {
    return value.match(/[•·]\s*(\d{1,2}:\d{2}\s+[AP]M)$/i)?.[1] ?? null;
  }
}
