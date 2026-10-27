import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Provider, PaymentScreenshot } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../database.prisma";
import { S3Storage } from "../storage/s3.storage";
import { ProviderCode } from "../common/enums/domain.enums";
import { businessDate, receiptTime } from "../common/business-date";
import { ProviderRegistry } from "../providers/provider-registry";
import { OcrExtraction } from "../providers/provider.contracts";
import { GoogleVisionOcrEngine } from "../ocr/ocr.engine";
import { MatchingEngine } from "./matching.engine";
import { MatchCandidate } from "./verification.dto";
import { ReceiptDetailsDto } from "./receipt.dto";

@Injectable()
export class OcrVerificationService {
  private readonly matching = new MatchingEngine();
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
    private readonly ocr: GoogleVisionOcrEngine,
    private readonly providers: ProviderRegistry,
    private readonly config: ConfigService,
  ) {}

  async processScreenshot(
    screenshotId: string,
    batchId?: string,
    actorId?: string,
  ) {
    const screenshot = await this.claim(screenshotId, batchId);
    let extraction: OcrExtraction | null = null;
    let reason: string | null = null;
    let engine = "google-vision";
    let version = "v1";
    if (!this.config.get<string>("ocr.googleVisionApiKey")) {
      reason = "OCR_NOT_CONFIGURED_ENTER_DETAILS";
    } else {
      try {
        const result = await this.ocr.extractText(
          await this.storage.getObject(screenshot.storageKey),
        );
        engine = result.engine;
        version = result.engineVersion;
        const provider =
          screenshot.submittedProvider ?? this.detectProvider(result.text);
        if (provider !== "KBZPAY") reason = "KBZPAY_RECEIPT_REQUIRED";
        else {
          extraction = this.providers
            .getExtractor(ProviderCode.KBZPAY)
            .extract(result.text);
          if (extraction.provider !== ProviderCode.KBZPAY) {
            extraction = null;
            reason = "KBZPAY_RECEIPT_REQUIRED";
          } else if (extraction.date) {
            try {
              businessDate(extraction.date);
            } catch {
              extraction.date = null;
              extraction.time = null;
              reason = "OCR_FIELDS_NEED_REVIEW";
            }
          }
        }
      } catch {
        reason = "OCR_FAILED_ENTER_DETAILS";
      }
    }
    try {
      return await this.persist(
        screenshot,
        extraction,
        reason,
        batchId,
        actorId,
        engine,
        version,
      );
    } catch (error) {
      await this.prisma.paymentScreenshot.updateMany({
        where: { id: screenshotId, status: "PROCESSING" },
        data: {
          status: "FAILED",
          lastError:
            "Processing could not be saved. Retry or enter receipt details.",
        },
      });
      throw error;
    }
  }

  async enterDetails(id: string, dto: ReceiptDetailsDto, actorId: string) {
    businessDate(dto.date);
    if (Number(dto.amount) <= 0)
      throw new BadRequestException("Amount must be greater than zero");
    if (dto.time && !receiptTime(dto.date, dto.time))
      throw new BadRequestException("Invalid receipt time");
    const screenshot = await this.claim(id);
    try {
      return await this.persist(
        screenshot,
        {
          provider: ProviderCode.KBZPAY,
          transactionStatus: null,
          direction: "UNKNOWN",
          amount: Number(dto.amount).toFixed(2),
          currency: "MMK",
          transactionId: dto.transactionId?.trim() || null,
          date: dto.date,
          time: dto.time || null,
          sender: null,
          senderPhone: null,
          receiver: dto.receiver || null,
          receiverPhone: null,
          rawText: "",
          fieldConfidence: {},
          overallConfidence: null,
        },
        null,
        undefined,
        actorId,
        "manual-entry",
        "1",
      );
    } catch (error) {
      await this.prisma.paymentScreenshot.updateMany({
        where: { id, status: "PROCESSING" },
        data: { status: "PENDING_REVIEW" },
      });
      throw error;
    }
  }

  private async claim(
    id: string,
    batchId?: string,
  ): Promise<PaymentScreenshot> {
    const screenshot = await this.prisma.paymentScreenshot.findUnique({
      where: { id },
    });
    if (!screenshot) throw new NotFoundException("Screenshot was not found");
    if (
      screenshot.submittedProvider &&
      screenshot.submittedProvider !== "KBZPAY"
    )
      throw new BadRequestException("The MVP reviews KBZPay only");
    if (batchId) {
      const batch = await this.prisma.verificationBatch.findUnique({
        where: { id: batchId },
      });
      if (
        !batch ||
        !batch.providerScope.includes("KBZPAY") ||
        batch.status !== "RUNNING"
      ) {
        throw new BadRequestException("A running KBZPay batch is required");
      }
    }
    const claimed = await this.prisma.paymentScreenshot.updateMany({
      where: {
        id,
        status: {
          in: [
            "RECEIVED",
            "PENDING_REVIEW",
            "FAILED",
            "UNMATCHED",
            "OCR_COMPLETED",
          ],
        },
      },
      data: { status: "PROCESSING", lastError: null },
    });
    if (!claimed.count)
      throw new ConflictException(
        "This screenshot is processing or has already been resolved",
      );
    return screenshot;
  }

  private async persist(
    screenshot: PaymentScreenshot,
    extraction: OcrExtraction | null,
    fallbackReason: string | null,
    requestedBatchId?: string,
    actorId?: string,
    engine = "google-vision",
    engineVersion = "v1",
  ) {
    const dateText =
      extraction?.date ||
      screenshot.businessDate?.toISOString().slice(0, 10) ||
      new Date(screenshot.receivedAt.getTime() + 23400000)
        .toISOString()
        .slice(0, 10);
    const date = businessDate(dateText);
    const beforeMinutes =
      this.config.get<number>("verification.defaultToleranceBeforeMinutes") ??
      2;
    const afterMinutes =
      this.config.get<number>("verification.defaultToleranceAfterMinutes") ?? 2;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PaymentScreenshot" WHERE id = ${screenshot.id}::uuid FOR UPDATE`;
      const current = await tx.paymentScreenshot.findUniqueOrThrow({
        where: { id: screenshot.id },
      });
      if (current.status !== "PROCESSING")
        throw new ConflictException("Screenshot is no longer processing");
      const history = await tx.paymentTransaction.findMany({
        where: {
          provider: "KBZPAY",
          businessDate: date,
          direction: "INCOMING",
        },
        include: { usedTransaction: true },
        take: 5001,
      });
      const candidates: MatchCandidate[] = history.map((t) => ({
        transactionId: t.id,
        externalTransactionId: t.externalTransactionId,
        provider: ProviderCode.KBZPAY,
        direction: t.direction,
        amount: t.amount.toFixed(2),
        currency: t.currency,
        transactionAtUtc: t.transactionAtUtc,
        reference: t.reference,
      }));
      const decision = extraction
        ? this.matching.decide(
            {
              provider: ProviderCode.KBZPAY,
              direction: "INCOMING",
              transactionId: extraction.transactionId,
              amount: extraction.amount,
              currency: extraction.currency,
              transactionAtUtc: receiptTime(extraction.date, extraction.time),
            },
            candidates,
            {
              beforeMinutes,
              afterMinutes,
              allowLevelThreeAutoVerify: false,
              allowOutgoingAutoVerify: false,
            },
          )
        : null;
      const proposed = decision?.candidate;
      const alreadyUsed = proposed
        ? history.find((t) => t.id === proposed.transactionId)?.usedTransaction
        : null;
      const reasonCode =
        fallbackReason ||
        (alreadyUsed ? "TRANSACTION_ALREADY_USED" : decision?.reasonCode) ||
        "NO_MATCH";
      const previous = await tx.verificationResult.findFirst({
        where: { screenshotId: screenshot.id },
        orderBy: { createdAt: "desc" },
      });
      let batchId = requestedBatchId || previous?.batchId;
      if (!batchId) {
        const batch = await tx.verificationBatch.create({
          data: {
            businessDate: date,
            status: "COMPLETED",
            triggerType: "MANUAL",
            providerScope: ["KBZPAY"],
            createdById: actorId,
            totalScreenshots: 1,
            processed: 1,
            pendingReview: 1,
            startedAt: new Date(),
            completedAt: new Date(),
            configSnapshot: { mode: "REVIEW_ONLY" },
          },
        });
        batchId = batch.id;
      }
      if (extraction)
        await tx.ocrResult.create({
          data: {
            screenshotId: screenshot.id,
            provider: "KBZPAY",
            ocrEngine: engine,
            ocrEngineVersion: engineVersion,
            rawText: extraction.rawText,
            extractedAmount: extraction.amount,
            extractedCurrency: extraction.currency,
            extractedTransactionId: extraction.transactionId,
            extractedDate: extraction.date
              ? businessDate(extraction.date)
              : null,
            extractedTime: extraction.time,
            extractedSender: extraction.sender,
            extractedReceiver: extraction.receiver,
            extractedSenderPhone: extraction.senderPhone,
            extractedReceiverPhone: extraction.receiverPhone,
            fieldConfidenceJson: extraction.fieldConfidence,
            overallConfidence: extraction.overallConfidence,
            status: "COMPLETED",
          },
        });
      const data = {
        provider: "KBZPAY" as Provider,
        status: "OPEN" as const,
        transactionId: proposed?.transactionId || null,
        matchLevel: decision?.matchLevel,
        matchScore: decision?.matchScore,
        reasonCode,
        ruleVersion: "mvp-review-1",
        toleranceSnapshot: { beforeMinutes, afterMinutes },
        candidateSnapshot: proposed
          ? (JSON.parse(JSON.stringify(proposed)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      };
      await tx.verificationResult.upsert({
        where: {
          batchId_screenshotId: { batchId, screenshotId: screenshot.id },
        },
        create: { ...data, batchId, screenshotId: screenshot.id },
        update: data,
      });
      await tx.paymentScreenshot.update({
        where: { id: screenshot.id },
        data: {
          status: "PENDING_REVIEW",
          detectedProvider: extraction?.provider || current.detectedProvider,
          businessDate: date,
          lastError: fallbackReason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action:
            engine === "manual-entry"
              ? "RECEIPT_DETAILS_ENTERED"
              : "OCR_PROCESSED",
          entityType: "PaymentScreenshot",
          entityId: screenshot.id,
          newValueJson: {
            reasonCode,
            proposedTransactionId: proposed?.transactionId || null,
            mode: "REVIEW_ONLY",
          },
        },
      });
      return {
        screenshotId: screenshot.id,
        status: "PENDING_REVIEW",
        reasonCode,
        candidateId: proposed?.transactionId || null,
      };
    });
  }

  private detectProvider(text: string): Provider | null {
    return /KBZ\s*PAY/i.test(text) ? "KBZPAY" : null;
  }
}
