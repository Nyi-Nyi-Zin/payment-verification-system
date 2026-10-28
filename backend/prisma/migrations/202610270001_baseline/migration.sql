-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'REVIEWER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('KBZPAY', 'AYAPAY', 'WAVEPAY');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('INCOMING', 'OUTGOING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PARSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "ScreenshotStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'OCR_COMPLETED', 'PENDING_REVIEW', 'VERIFIED', 'DUPLICATE', 'UNMATCHED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('CREATED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'MARKED_DUPLICATE', 'REPROCESSED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "TelegramUpdateStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "displayName" TEXT NOT NULL,
    "emailOrPhone" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT,
    "refreshTokenHash" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUser" (
    "id" UUID NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "username" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "id" UUID NOT NULL,
    "updateId" BIGINT NOT NULL,
    "telegramChatId" BIGINT,
    "telegramMessageId" BIGINT,
    "telegramUserId" BIGINT,
    "status" "TelegramUpdateStatus" NOT NULL DEFAULT 'RECEIVED',
    "rawJson" JSONB NOT NULL,
    "failureReason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessWalletConfig" (
    "id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "accountName" TEXT NOT NULL,
    "normalizedAccountName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "normalizedPhoneNumber" TEXT,
    "allowOutgoingAutoVerify" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessWalletConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentImport" (
    "id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "businessDate" DATE NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "parsedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentImportError" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "rawRowReference" JSONB,
    "errorCode" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "externalTransactionId" TEXT,
    "transactionStatus" TEXT,
    "direction" "TransactionDirection" NOT NULL DEFAULT 'UNKNOWN',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "creditAmount" DECIMAL(18,2),
    "debitAmount" DECIMAL(18,2),
    "runningBalance" DECIMAL(18,2),
    "transactionAtUtc" TIMESTAMP(3) NOT NULL,
    "transactionAtLocal" TIMESTAMP(3) NOT NULL,
    "localTimezone" TEXT NOT NULL DEFAULT 'Asia/Yangon',
    "businessDate" DATE NOT NULL,
    "senderName" TEXT,
    "senderPhone" TEXT,
    "receiverName" TEXT,
    "receiverPhone" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "sourceImportId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "rawRowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentScreenshot" (
    "id" UUID NOT NULL,
    "telegramUpdateId" BIGINT NOT NULL,
    "telegramMessageId" BIGINT,
    "telegramUserId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "submittedProvider" "Provider",
    "detectedProvider" "Provider",
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ScreenshotStatus" NOT NULL DEFAULT 'RECEIVED',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrResult" (
    "id" UUID NOT NULL,
    "screenshotId" UUID NOT NULL,
    "ocrEngine" TEXT NOT NULL,
    "ocrEngineVersion" TEXT,
    "provider" "Provider",
    "transactionStatus" TEXT,
    "direction" "TransactionDirection",
    "rawText" TEXT,
    "extractedAmount" DECIMAL(18,2),
    "extractedCurrency" TEXT,
    "extractedTransactionId" TEXT,
    "extractedDate" DATE,
    "extractedTime" TEXT,
    "extractedSender" TEXT,
    "extractedSenderPhone" TEXT,
    "extractedReceiver" TEXT,
    "extractedReceiverPhone" TEXT,
    "fieldConfidenceJson" JSONB,
    "overallConfidence" DECIMAL(5,4),
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationBatch" (
    "id" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "dateRangeEnd" DATE,
    "status" "BatchStatus" NOT NULL DEFAULT 'CREATED',
    "triggerType" "TriggerType" NOT NULL,
    "providerScope" "Provider"[],
    "configSnapshot" JSONB,
    "totalScreenshots" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "duplicate" INTEGER NOT NULL DEFAULT 0,
    "pendingReview" INTEGER NOT NULL DEFAULT 0,
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationResult" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "screenshotId" UUID NOT NULL,
    "provider" "Provider",
    "transactionId" UUID,
    "status" "ReviewStatus" NOT NULL,
    "matchLevel" INTEGER,
    "matchScore" DECIMAL(5,4),
    "reasonCode" TEXT NOT NULL,
    "candidateSnapshot" JSONB,
    "ruleVersion" TEXT,
    "toleranceSnapshot" JSONB,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsedTransaction" (
    "id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "transactionId" UUID NOT NULL,
    "screenshotId" UUID NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientUserId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailOrPhone_key" ON "User"("emailOrPhone");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_telegramUserId_key" ON "TelegramUser"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdate_updateId_key" ON "TelegramUpdate"("updateId");

-- CreateIndex
CREATE INDEX "TelegramUpdate_status_receivedAt_idx" ON "TelegramUpdate"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessWalletConfig_provider_key" ON "BusinessWalletConfig"("provider");

-- CreateIndex
CREATE INDEX "PaymentImport_provider_businessDate_idx" ON "PaymentImport"("provider", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentImport_provider_fileHash_key" ON "PaymentImport"("provider", "fileHash");

-- CreateIndex
CREATE INDEX "PaymentImportError_importId_sourceRowNumber_idx" ON "PaymentImportError"("importId", "sourceRowNumber");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_businessDate_amount_idx" ON "PaymentTransaction"("provider", "businessDate", "amount");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_transactionAtUtc_idx" ON "PaymentTransaction"("provider", "transactionAtUtc");

-- CreateIndex
CREATE INDEX "PaymentTransaction_fingerprint_idx" ON "PaymentTransaction"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_provider_externalTransactionId_key" ON "PaymentTransaction"("provider", "externalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentScreenshot_telegramUpdateId_key" ON "PaymentScreenshot"("telegramUpdateId");

-- CreateIndex
CREATE INDEX "PaymentScreenshot_fileHash_idx" ON "PaymentScreenshot"("fileHash");

-- CreateIndex
CREATE INDEX "PaymentScreenshot_status_receivedAt_idx" ON "PaymentScreenshot"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "OcrResult_screenshotId_createdAt_idx" ON "OcrResult"("screenshotId", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationBatch_businessDate_status_idx" ON "VerificationBatch"("businessDate", "status");

-- CreateIndex
CREATE INDEX "VerificationResult_status_createdAt_idx" ON "VerificationResult"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationResult_transactionId_idx" ON "VerificationResult"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationResult_batchId_screenshotId_key" ON "VerificationResult"("batchId", "screenshotId");

-- CreateIndex
CREATE UNIQUE INDEX "UsedTransaction_transactionId_key" ON "UsedTransaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "UsedTransaction_provider_transactionId_key" ON "UsedTransaction"("provider", "transactionId");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_status_idx" ON "Notification"("recipientUserId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentImport" ADD CONSTRAINT "PaymentImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentImportError" ADD CONSTRAINT "PaymentImportError_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PaymentImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "PaymentImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentScreenshot" ADD CONSTRAINT "PaymentScreenshot_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "TelegramUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrResult" ADD CONSTRAINT "OcrResult_screenshotId_fkey" FOREIGN KEY ("screenshotId") REFERENCES "PaymentScreenshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationBatch" ADD CONSTRAINT "VerificationBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "VerificationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_screenshotId_fkey" FOREIGN KEY ("screenshotId") REFERENCES "PaymentScreenshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsedTransaction" ADD CONSTRAINT "UsedTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsedTransaction" ADD CONSTRAINT "UsedTransaction_screenshotId_fkey" FOREIGN KEY ("screenshotId") REFERENCES "PaymentScreenshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

