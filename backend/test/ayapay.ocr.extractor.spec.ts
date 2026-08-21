import { AyapayOcrExtractor } from '../src/providers/ayapay.ocr.extractor';
import { ProviderCode } from '../src/common/enums/domain.enums';

describe('AyapayOcrExtractor', () => {
  const extractor = new AyapayOcrExtractor();

  it('extracts an outgoing AYA Pay transfer', () => {
    const result = extractor.extract(`
      AYA PAY
      E-Receipt
      Transaction Type Transfer to Wallet
      Transaction Code 271606341850
      Transaction Status done
      Date and Time 9 August 2026, 2:12 PM
      Sender Name NYI NYI ZIN
      Sender Phone 09675507310
      Receiver Name THA TOE AUNG
      Receiver Phone 09699994146
      Amount 2,000 MMK
      Total 2,000 MMK
      Notes Payment
    `);

    expect(result.provider).toBe(ProviderCode.AYAPAY);
    expect(result.transactionId).toBe('271606341850');
    expect(result.transactionStatus).toBe('DONE');
    expect(result.amount).toBe('2000.00');
    expect(result.currency).toBe('MMK');
    expect(result.sender).toBe('NYI NYI ZIN');
    expect(result.receiver).toBe('THA TOE AUNG');
    expect(result.date).toBe('2026-08-09');
    expect(result.time).toBe('2:12 PM');
  });

  it('extracts an incoming AYA Pay transfer without assuming direction', () => {
    const result = extractor.extract(`
      AYA PAY
      E-Receipt
      Transaction Type Transfer to Wallet
      Transaction Code 268135713411
      Transaction Status done
      Date and Time 30 June 2026, 10:08 AM
      Sender Name KHIN SANDAR WIN
      Sender Phone 09250757250
      Receiver Name NYI NYI ZIN
      Receiver Phone 09675507310
      Amount 100,000 MMK
      Total 100,000 MMK
      Notes Khin sandar win
    `);

    expect(result.transactionId).toBe('268135713411');
    expect(result.amount).toBe('100000.00');
    expect(result.sender).toBe('KHIN SANDAR WIN');
    expect(result.receiver).toBe('NYI NYI ZIN');
    expect(result.direction).toBe('UNKNOWN');
  });
});
