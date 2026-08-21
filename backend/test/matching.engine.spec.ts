import { ProviderCode } from '../src/common/enums/domain.enums';
import { MatchCandidate } from '../src/verification/verification.dto';
import { MatchingEngine } from '../src/verification/matching.engine';

const candidate = (
  overrides: Partial<MatchCandidate> = {},
): MatchCandidate => ({
  transactionId: 'TX-001',
  provider: ProviderCode.KBZPAY,
  amount: '1000.00',
  currency: 'MMK',
  transactionAtUtc: new Date('2026-08-21T10:00:00.000Z'),
  ...overrides,
});

describe('MatchingEngine', () => {
  const engine = new MatchingEngine();
  const config = {
    beforeMinutes: 2,
    afterMinutes: 2,
    allowLevelThreeAutoVerify: false,
  };

  it('matches an exact transaction ID only within the same provider', () => {
    const result = engine.decide(
      {
        provider: ProviderCode.KBZPAY,
        transactionId: ' tx-001 ',
        amount: '1000',
        currency: 'MMK',
        transactionAtUtc: new Date('2026-08-21T10:00:00.000Z'),
      },
      [candidate(), candidate({ provider: ProviderCode.AYAPAY })],
      config,
    );

    expect(result.status).toBe('VERIFIED');
    expect(result.matchLevel).toBe(1);
    expect(result.candidate?.provider).toBe(ProviderCode.KBZPAY);
  });

  it('uses the configured Level 2 time window when ID is unavailable', () => {
    const result = engine.decide(
      {
        provider: ProviderCode.KBZPAY,
        transactionId: null,
        amount: '1000.00',
        currency: 'MMK',
        transactionAtUtc: new Date('2026-08-21T10:02:00.000Z'),
      },
      [candidate()],
      config,
    );

    expect(result.status).toBe('VERIFIED');
    expect(result.matchLevel).toBe(2);
  });

  it('sends multiple Level 2 candidates to review', () => {
    const result = engine.decide(
      {
        provider: ProviderCode.KBZPAY,
        transactionId: null,
        amount: '1000.00',
        currency: 'MMK',
        transactionAtUtc: new Date('2026-08-21T10:00:00.000Z'),
      },
      [candidate(), candidate({ transactionId: 'TX-002' })],
      config,
    );

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.reasonCode).toBe('MULTIPLE_LEVEL_TWO_CANDIDATES');
  });

  it('does not match a transaction outside the tolerance window', () => {
    const result = engine.decide(
      {
        provider: ProviderCode.KBZPAY,
        transactionId: null,
        amount: '1000.00',
        currency: 'MMK',
        transactionAtUtc: new Date('2026-08-21T10:03:00.001Z'),
      },
      [candidate()],
      config,
    );

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.reasonCode).toBe('NO_LEVEL_TWO_CANDIDATE');
  });
});
