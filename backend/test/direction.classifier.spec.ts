import { ProviderCode } from '../src/common/enums/domain.enums';
import { DirectionClassifier } from '../src/verification/direction.classifier';
import { AyapayOcrExtractor } from '../src/providers/ayapay.ocr.extractor';

describe('DirectionClassifier', () => {
  const classifier = new DirectionClassifier();
  const wallet = {
    provider: ProviderCode.AYAPAY,
    accountName: 'Nyi Nyi Zin',
    phoneNumber: '09675507310',
    allowOutgoingAutoVerify: false,
  };

  it('classifies a transfer to the business phone as incoming', () => {
    const result = classifier.classify(
      wallet,
      { name: 'Khin Sandar Win', phone: '+959250757250' },
      { name: 'NYI NYI ZIN', phone: '09675507310' },
    );

    expect(result.direction).toBe('INCOMING');
    expect(result.matchedBy).toBe('RECEIVER');
    expect(result.reasonCode).toBe('BUSINESS_WALLET_IS_RECEIVER');
  });

  it('classifies a transfer from the business account as outgoing', () => {
    const result = classifier.classify(
      wallet,
      { name: 'NYI NYI ZIN', phone: '959675507310' },
      { name: 'Tha Toe Aung', phone: '09699994146' },
    );

    expect(result.direction).toBe('OUTGOING');
    expect(result.matchedBy).toBe('SENDER');
  });

  it('classifies the supplied AYA incoming receipt through the OCR boundary', () => {
    const extraction = new AyapayOcrExtractor().extract(`
      AYA PAY
      Transaction Code 268135713411
      Transaction Status done
      Date and Time 30 June 2026, 10:08 AM
      Sender Name KHIN SANDAR WIN
      Sender Phone 09250757250
      Receiver Name NYI NYI ZIN
      Receiver Phone 09675507310
      Amount 100,000 MMK
      Total 100,000 MMK
    `);
    const result = classifier.classifyOcr(wallet, extraction);

    expect(result.direction).toBe('INCOMING');
    expect(result.matchedBy).toBe('RECEIVER');
  });

  it('returns unknown when identity is absent or matches both sides', () => {
    const absent = classifier.classify(
      wallet,
      { name: 'Someone Else', phone: '09111111111' },
      { name: 'Another Person', phone: '09222222222' },
    );
    const both = classifier.classify(
      wallet,
      { name: 'Nyi Nyi Zin', phone: '09675507310' },
      { name: 'Nyi Nyi Zin', phone: '09675507310' },
    );

    expect(absent.direction).toBe('UNKNOWN');
    expect(absent.matchedBy).toBe('NONE');
    expect(both.direction).toBe('UNKNOWN');
    expect(both.matchedBy).toBe('BOTH');
  });
});
