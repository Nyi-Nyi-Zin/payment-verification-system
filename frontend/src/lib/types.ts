export type Locale = "my" | "en";
export type Role = "ADMIN" | "OPERATOR" | "REVIEWER";
export interface User {
  id?: string;
  role: Role;
  emailOrPhone: string;
  displayName?: string;
  mustChangePassword?: boolean;
  hasPassword?: boolean;
  googleLinked?: boolean;
}
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
export interface LoginResponse {
  accessToken: string;
  user: User;
}
export interface StaffUser extends User {
  id: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  lastLoginAt: string | null;
  tempPasswordExpiresAt: string | null;
}
export interface TemporaryCredentials {
  user: StaffUser;
  temporaryPassword: string;
  expiresAt: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type Status =
  | "RECEIVED"
  | "OCR_PROCESSING"
  | "OCR_COMPLETED"
  | "READY_FOR_VERIFICATION"
  | "VERIFIED"
  | "DUPLICATE"
  | "UNMATCHED"
  | "FAILED"
  | "REJECTED"
  | "NEEDS_REVIEW"
  | "PENDING_REVIEW"
  | "PROCESSING"
  | "QUEUED";
export interface Transaction {
  id: string;
  externalTransactionId: string;
  amount: string;
  currency?: string;
  businessDate?: string;
  transactionAtUtc: string;
  receiverName?: string;
  usedTransaction?: { screenshotId: string | null; usedAt: string } | null;
}
export interface OcrResult {
  extractedAmount?: string | null;
  extractedTransactionId?: string | null;
  extractedDate?: string | null;
  extractedTime?: string | null;
  extractedReceiver?: string | null;
}
export interface Receipt {
  id: string;
  status: Status;
  businessDate: string;
  receivedAt: string;
  source?: string;
  lastError?: string | null;
  ocrResults?: OcrResult[];
  verificationResults?: {
    reasonCode?: string;
    transaction?: Transaction | null;
  }[];
}
export interface CheckResult {
  screenshotId: string;
  status: Status;
  duplicate?: boolean;
  reasonCode?: string;
}
export interface ImportRecord {
  id: string;
  fileName: string;
  status: string;
  parsedRows: number;
  totalRows: number;
  errorRows: number;
  createdAt: string;
}
export interface ImportError {
  sourceRowNumber: number;
  errorCode: string;
  errorMessage: string;
}
export interface Dashboard {
  transactions: number;
  imports: number;
  receipts: Record<string, number>;
  ocrConfigured: boolean;
  ocrDriver?: string;
}
export interface ImportResult {
  id?: string;
  importId?: string;
  parsedRows?: number;
  skippedRows?: number;
  errorRows?: number;
  duplicate?: boolean;
}
export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;
