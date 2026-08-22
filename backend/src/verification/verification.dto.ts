import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ProviderCode, TriggerType } from '../common/enums/domain.enums';
import { TransactionDirection } from '../providers/provider.contracts';

export class StartVerificationDto {
  @IsDateString()
  businessDate!: string;

  @IsOptional()
  @IsDateString()
  dateRangeEnd?: string;

  @IsArray()
  @IsEnum(ProviderCode, { each: true })
  providers!: ProviderCode[];

  @IsEnum(TriggerType)
  triggerType!: TriggerType;
}

export class ToleranceConfigDto {
  @IsInt()
  @Min(0)
  @Max(120)
  beforeMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(120)
  afterMinutes!: number;
}

export interface MatchCandidate {
  transactionId: string;
  provider: ProviderCode;
  direction: TransactionDirection;
  amount: string;
  currency: string;
  transactionAtUtc: Date;
  senderName?: string | null;
  receiverName?: string | null;
  reference?: string | null;
}

export interface OcrMatchInput {
  provider: ProviderCode | null;
  direction: TransactionDirection;
  transactionId: string | null;
  amount: string | null;
  currency: string | null;
  transactionAtUtc: Date | null;
  senderName?: string | null;
  receiverName?: string | null;
  reference?: string | null;
}

export type MatchDecision =
  | {
      status: 'VERIFIED';
      matchLevel: 1 | 2 | 3;
      matchScore: number;
      candidate: MatchCandidate;
      reasonCode: string;
    }
  | {
      status: 'PENDING_REVIEW' | 'UNMATCHED';
      matchLevel: null;
      matchScore: number;
      candidate: null;
      reasonCode: string;
    };
