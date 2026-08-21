import { ProviderCode } from '../common/enums/domain.enums';

export interface CanonicalTransaction {
  provider: ProviderCode;
  externalTransactionId: string | null;
  amount: string;
  currency: string;
  transactionAtUtc: Date;
  transactionAtLocal: Date;
  localTimezone: string;
  businessDate: string;
  senderName: string | null;
  receiverName: string | null;
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
  parse(input: Buffer, fileName: string, businessDate: string): Promise<ParserResult>;
}

export interface OcrExtraction {
  provider: ProviderCode | null;
  rawText: string;
  amount: string | null;
  currency: string | null;
  transactionId: string | null;
  date: string | null;
  time: string | null;
  sender: string | null;
  receiver: string | null;
  fieldConfidence: Record<string, number>;
  overallConfidence: number | null;
}

export interface ProviderOcrExtractor {
  readonly provider: ProviderCode;
  extract(rawText: string): OcrExtraction;
}
