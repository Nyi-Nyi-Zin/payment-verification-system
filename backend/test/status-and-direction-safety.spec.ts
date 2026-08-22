import { BatchStatus, ScreenshotStatus } from '@prisma/client';
import { ProviderCode } from '../src/common/enums/domain.enums';
import { MatchingEngine } from '../src/verification/matching.engine';
import { StatusTransitionService } from '../src/verification/status.transitions';

const candidate = {
  transactionId: 'tx-1',
  provider: ProviderCode.AYAPAY,
  direction: 'INCOMING' as const,
  amount: '100.00',
  currency: 'MMK',
  transactionAtUtc: new Date('2026-08-22T10:00:00.000Z'),
};

describe('workflow safety', () => {
  it('rejects terminal screenshot transitions', () => {
    const service = new StatusTransitionService();

    expect(service.canMoveScreenshot(ScreenshotStatus.VERIFIED, ScreenshotStatus.RECEIVED)).toBe(false);
    expect(() =>
      service.assertScreenshotTransition(
        ScreenshotStatus.VERIFIED,
        ScreenshotStatus.RECEIVED,
      ),
    ).toThrow('Invalid screenshot transition');
  });

  it('rejects a batch completing before it starts', () => {
    const service = new StatusTransitionService();

    expect(service.canMoveBatch(BatchStatus.CREATED, BatchStatus.COMPLETED)).toBe(false);
  });

  it('routes unknown direction to review', () => {
    const engine = new MatchingEngine();
    const result = engine.decide(
      {
        provider: ProviderCode.AYAPAY,
        direction: 'UNKNOWN',
        transactionId: 'tx-1',
        amount: '100.00',
        currency: 'MMK',
        transactionAtUtc: new Date('2026-08-22T10:00:00.000Z'),
      },
      [candidate],
      {
        beforeMinutes: 2,
        afterMinutes: 2,
        allowLevelThreeAutoVerify: false,
        allowOutgoingAutoVerify: false,
      },
    );

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.reasonCode).toBe('DIRECTION_UNKNOWN');
  });

  it('does not auto-verify outgoing direction by default', () => {
    const engine = new MatchingEngine();
    const result = engine.decide(
      {
        provider: ProviderCode.AYAPAY,
        direction: 'OUTGOING',
        transactionId: 'tx-1',
        amount: '100.00',
        currency: 'MMK',
        transactionAtUtc: new Date('2026-08-22T10:00:00.000Z'),
      },
      [candidate],
      {
        beforeMinutes: 2,
        afterMinutes: 2,
        allowLevelThreeAutoVerify: false,
        allowOutgoingAutoVerify: false,
      },
    );

    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.reasonCode).toBe('OUTGOING_AUTO_VERIFY_DISABLED');
  });
});
