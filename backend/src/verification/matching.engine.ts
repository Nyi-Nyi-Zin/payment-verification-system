import { MatchCandidate, MatchDecision, OcrMatchInput } from './verification.dto';
import { MatchLevel } from '../common/enums/domain.enums';

export interface MatchingConfig {
  beforeMinutes: number;
  afterMinutes: number;
  allowLevelThreeAutoVerify: boolean;
  allowOutgoingAutoVerify: boolean;
}

export class MatchingEngine {
  decide(
    input: OcrMatchInput,
    candidates: MatchCandidate[],
    config: MatchingConfig,
  ): MatchDecision {
    if (!input.provider) {
      return this.review('PROVIDER_NOT_DETECTED');
    }

    if (input.direction === 'UNKNOWN') {
      return this.review('DIRECTION_UNKNOWN');
    }

    if (input.direction === 'OUTGOING' && !config.allowOutgoingAutoVerify) {
      return this.review('OUTGOING_AUTO_VERIFY_DISABLED');
    }

    const providerCandidates = candidates.filter(
      (candidate) =>
        candidate.provider === input.provider &&
        candidate.direction === input.direction,
    );

    if (providerCandidates.length === 0) {
      return this.unmatched('NO_PROVIDER_SCOPED_CANDIDATE');
    }

    if (input.transactionId) {
      const exact = providerCandidates.filter(
        (candidate) =>
          this.normalizeId(candidate.transactionId) ===
          this.normalizeId(input.transactionId as string),
      );

      if (exact.length === 1 && this.amountMatches(input, exact[0])) {
        return this.verified(
          exact[0],
          MatchLevel.EXACT_TRANSACTION_ID,
          1,
          'EXACT_TRANSACTION_ID',
        );
      }

      if (exact.length > 1) {
        return this.review('MULTIPLE_EXACT_TRANSACTION_ID_CANDIDATES');
      }
    }

    if (!input.amount || !input.transactionAtUtc) {
      return this.review('INSUFFICIENT_FIELDS_FOR_LEVEL_TWO');
    }

    const levelTwo = providerCandidates.filter((candidate) => {
      if (!this.amountMatches(input, candidate)) {
        return false;
      }
      return this.withinWindow(
        input.transactionAtUtc as Date,
        candidate.transactionAtUtc,
        config.beforeMinutes,
        config.afterMinutes,
      );
    });

    if (levelTwo.length === 1) {
      return this.verified(
        levelTwo[0],
        MatchLevel.AMOUNT_DATE_TIME,
        0.95,
        'AMOUNT_DATE_TIME_UNIQUE_CANDIDATE',
      );
    }

    if (levelTwo.length > 1) {
      return this.review('MULTIPLE_LEVEL_TWO_CANDIDATES');
    }

    return this.review('NO_LEVEL_TWO_CANDIDATE');
  }

  private normalizeId(value: string): string {
    return value.trim().toUpperCase().replace(/[\s-]/g, '');
  }

  private amountMatches(input: OcrMatchInput, candidate: MatchCandidate): boolean {
    if (!input.amount || input.currency !== candidate.currency) {
      return false;
    }
    return this.toCents(input.amount) === this.toCents(candidate.amount);
  }

  private toCents(value: string): number {
    return Math.round(Number.parseFloat(value) * 100);
  }

  private withinWindow(
    inputTime: Date,
    candidateTime: Date,
    beforeMinutes: number,
    afterMinutes: number,
  ): boolean {
    const differenceMinutes = (candidateTime.getTime() - inputTime.getTime()) / 60_000;
    return differenceMinutes >= -beforeMinutes && differenceMinutes <= afterMinutes;
  }

  private verified(
    candidate: MatchCandidate,
    matchLevel: 1 | 2 | 3,
    matchScore: number,
    reasonCode: string,
  ): MatchDecision {
    return { status: 'VERIFIED', matchLevel, matchScore, candidate, reasonCode };
  }

  private review(reasonCode: string): MatchDecision {
    return {
      status: 'PENDING_REVIEW',
      matchLevel: null,
      matchScore: 0,
      candidate: null,
      reasonCode,
    };
  }

  private unmatched(reasonCode: string): MatchDecision {
    return {
      status: 'UNMATCHED',
      matchLevel: null,
      matchScore: 0,
      candidate: null,
      reasonCode,
    };
  }
}
