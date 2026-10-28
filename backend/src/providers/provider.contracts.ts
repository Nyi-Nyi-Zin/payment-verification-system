import { ProviderCode } from "../common/enums/domain.enums";

export type TransactionDirection = "INCOMING" | "OUTGOING" | "UNKNOWN";

export interface CanonicalTransaction {
  provider: ProviderCode;
  externalTransactionId: string | null;
  transactionStatus: string | null;
  direction: TransactionDirection;
  amount: string;
  currency: string;
  creditAmount: string | null;
  debitAmount: string | null;
  runningBalance: string | null;
  transactionAtUtc: Date;
  transactionAtLocal: Date;
  localTimezone: string;
  businessDate: string;
  senderName: string | null;
  senderPhone: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  description: string | null;
  reference: string | null;
  fingerprint: string;
  rawRow: Record<string, unknown>;
}

export interface ParseError {
  sourceRowNumber: number;
  errorCode: string;
  errorMessage: string;
  rawRow?: Record<string, unknown>;
}

export interface ParserResult {
  provider: ProviderCode;
  parserVersion: string;
  totalRows: number;
  transactions: CanonicalTransaction[];
  errors: ParseError[];
}

export interface ProviderImportParser {
  readonly provider: ProviderCode;
  readonly version: string;
  parse(
    input: Buffer,
    fileName: string,
    businessDate?: string,
  ): Promise<ParserResult>;
}

export interface OcrExtraction {
  provider: ProviderCode | null;
  transactionStatus: string | null;
  direction: TransactionDirection;
  rawText: string;
  amount: string | null;
  currency: string | null;
  transactionId: string | null;
  date: string | null;
  time: string | null;
  sender: string | null;
  senderPhone: string | null;
  receiver: string | null;
  receiverPhone: string | null;
  transactionType?: string;
  totalAmount?: string;
  feeAmount?: string;
  notes?: string;
  fieldConfidence: Record<string, number>;
  overallConfidence: number | null;
}

export interface ProviderOcrExtractor {
  readonly provider: ProviderCode;
  extract(rawText: string): OcrExtraction;
}
