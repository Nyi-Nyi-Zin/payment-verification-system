import { ProviderCode } from '../src/common/enums/domain.enums';
import { WavepayOcrExtractor } from '../src/providers/wavepay.ocr.extractor';

describe('WavepayOcrExtractor', () => {
  it('extracts the supplied successful receipt fields', () => {
    const result = new WavepayOcrExtractor().extract(`
      Successful
      9,800.00 Ks
      To
      Shwe Yee Moe
      9885713007
      Type Account
      Fees 0.00 Ks
      Amount 9,800.00 Ks
      Transaction ID 916641866
      Date & Time 22 August 2026 • 11:24 AM
      receipt by Wave
    `);

    expect(result.provider).toBe(ProviderCode.WAVEPAY);
    expect(result.transactionStatus).toBe('SUCCESSFUL');
    expect(result.amount).toBe('9800.00');
    expect(result.currency).toBe('MMK');
    expect(result.receiver).toBe('Shwe Yee Moe');
    expect(result.receiverPhone).toBe('09885713007');
    expect(result.transactionId).toBe('916641866');
    expect(result.date).toBe('2026-08-22');
    expect(result.time).toBe('11:24 AM');
    expect(result.feeAmount).toBe('0.00');
    expect(result.direction).toBe('UNKNOWN');
  });
});
