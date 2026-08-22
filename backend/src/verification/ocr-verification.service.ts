import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Provider as PrismaProvider } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database.prisma';
import { S3Storage } from '../storage/s3.storage';
import { ProviderCode } from '../common/enums/domain.enums';
import { ProviderRegistry } from '../providers/provider-registry';
import { OcrEngineResult } from '../ocr/ocr.engine';
import { GoogleVisionOcrEngine } from '../ocr/ocr.engine';
import { DirectionClassifier } from './direction.classifier';
import { MatchingEngine } from './matching.engine';
import { MatchCandidate, OcrMatchInput } from './verification.dto';

@Injectable()
export class OcrVerificationService {
  private readonly directionClassifier = new DirectionClassifier();
  private readonly matchingEngine = new MatchingEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
    private readonly ocr: GoogleVisionOcrEngine,
    private readonly providers: ProviderRegistry,
    private readonly config: ConfigService,
  ) {}

  async processScreenshot(screenshotId: string, batchId?: string) {
    const screenshot = await this.prisma.paymentScreenshot.findUnique({
      where: { id: screenshotId },
    });
    if (!screenshot) {
      throw new NotFoundException('Screenshot was not found');
    }

    await this.prisma.paymentScreenshot.update({
      where: { id: screenshotId },
      data: { status: 'PROCESSING', lastError: null },
    });

    try {
      const image = await this.storage.getObject(screenshot.storageKey);
      const ocrResult = await this.ocr.extractText(image);
      const provider = this.detectProvider(screenshot.submittedProvider, ocrResult.text);
      const extractor = provider ? this.providers.getExtractor(provider) : null;
      if (!provider || !extractor) {
        return this.failToReview(
          screenshotId,
          batchId,
          'PROVIDER_NOT_DETECTED_OR_EXTRACTOR_UNAVAILABLE',
          ocrResult,
          provider,
        );
      }

      const extraction = extractor.extract(ocrResult.text);
      const wallet = await this.prisma.businessWalletConfig.findUnique({
        where: { provider: provider as unknown as PrismaProvider },
      });
      const classification = wallet
        ? this.directionClassifier.classifyOcr(
            {
              provider: wallet.provider as unknown as ProviderCode,
              accountName: wallet.accountName,
              phoneNumber: wallet.phoneNumber,
              allowOutgoingAutoVerify: wallet.allowOutgoingAutoVerify,
            },
            extraction,
          )
        : {
            provider,
            direction: 'UNKNOWN' as const,
            matchedBy: 'NONE' as const,
            reasonCode: 'BUSINESS_WALLET_NOT_FOUND_IN_PARTIES' as const,
          };
      const transactionAtUtc = this.parseReceiptDateTime(extraction.date, extraction.time);
      const ocrRecord = await this.prisma.ocrResult.create({
        data: {
          screenshotId,
          ocrEngine: ocrResult.engine,
          ocrEngineVersion: ocrResult.engineVersion,
          provider: provider as unknown as PrismaProvider,
          transactionStatus: extraction.transactionStatus,
          direction: classification.direction,
          rawText: ocrResult.text,
          extractedAmount: extraction.amount ? Number(extraction.amount) : null,
          extractedCurrency: extraction.currency,
          extractedTransactionId: extraction.transactionId,
          extractedDate: extraction.date ? new Date(`${extraction.date}T00:00:00.000Z`) : null,
          extractedTime: extraction.time,
          extractedSender: extraction.sender,
          extractedSenderPhone: extraction.senderPhone,
          extractedReceiver: extraction.receiver,
          extractedReceiverPhone: extraction.receiverPhone,
          fieldConfidenceJson: extraction.fieldConfidence,
          overallConfidence: extraction.overallConfidence,
          status: 'COMPLETED',
        },
        select: { id: true },
      });

      await this.prisma.paymentScreenshot.update({
        where: { id: screenshotId },
        data: {
          detectedProvider: provider as unknown as PrismaProvider,
          status: 'OCR_COMPLETED',
        },
      });

      if (!batchId || !transactionAtUtc || classification.direction === 'UNKNOWN') {
        return this.markPendingReview(
          screenshotId,
          batchId,
          ocrRecord.id,
          classification.direction === 'UNKNOWN'
            ? classification.reasonCode
            : 'BATCH_OR_TRANSACTION_TIME_REQUIRED',
        );
      }

      const candidates = await this.loadCandidates(provider, extraction.date);
      const decision = this.matchingEngine.decide(
        {
          provider,
          direction: classification.direction,
          transactionId: extraction.transactionId,
          amount: extraction.amount,
          currency: extraction.currency,
          transactionAtUtc,
        },
        candidates,
        {
          beforeMinutes: this.config.get<number>('verification.defaultToleranceBeforeMinutes') ?? 2,
          afterMinutes: this.config.get<number>('verification.defaultToleranceAfterMinutes') ?? 2,
          allowLevelThreeAutoVerify: false,
          allowOutgoingAutoVerify: wallet?.allowOutgoingAutoVerify ?? false,
        },
      );

      await this.prisma.verificationResult.create({
        data: {
          batchId,
          screenshotId,
          provider: provider as unknown as PrismaProvider,
          transactionId: decision.candidate?.transactionId ?? null,
          status: decision.status === 'VERIFIED' ? 'APPROVED' : 'OPEN',
          matchLevel: decision.matchLevel ?? null,
          matchScore: decision.matchScore ?? null,
          reasonCode: decision.reasonCode,
          candidateSnapshot: decision.candidate
            ? (JSON.parse(JSON.stringify([decision.candidate])) as object)
            : undefined,
          ruleVersion: this.config.get<string>('verification.ruleVersion') ?? '1.0.0',
          toleranceSnapshot: {
            beforeMinutes: this.config.get<number>('verification.defaultToleranceBeforeMinutes') ?? 2,
            afterMinutes: this.config.get<number>('verification.defaultToleranceAfterMinutes') ?? 2,
          },
          verifiedAt: decision.status === 'VERIFIED' ? new Date() : null,
        },
      });

      await this.prisma.paymentScreenshot.update({
        where: { id: screenshotId },
        data: {
          status: decision.status === 'VERIFIED' ? 'VERIFIED' : 'PENDING_REVIEW',
        },
      });
      return { screenshotId, status: decision.status, reasonCode: decision.reasonCode };
    } catch (error) {
      await this.prisma.paymentScreenshot.update({
        where: { id: screenshotId },
        data: {
          status: 'FAILED',
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'OCR failed',
        },
      });
      throw error;
    }
  }

  private async loadCandidates(
    provider: ProviderCode,
    businessDate: string | null,
  ): Promise<MatchCandidate[]> {
    if (!businessDate) return [];
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        provider: provider as unknown as PrismaProvider,
        businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      },
      orderBy: { transactionAtUtc: 'asc' },
    });
    return transactions.map((transaction) => ({
      transactionId: transaction.id,
      provider,
      direction: transaction.direction,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      transactionAtUtc: transaction.transactionAtUtc,
      senderName: transaction.senderName,
      receiverName: transaction.receiverName,
      reference: transaction.reference,
    }));
  }

  private detectProvider(
    submittedProvider: PrismaProvider | null,
    text: string,
  ): ProviderCode | null {
    if (submittedProvider) return submittedProvider as unknown as ProviderCode;
    if (/AYA\s*PAY|E-RECEIPT/i.test(text)) return ProviderCode.AYAPAY;
    if (/receipt\s+by\s+wave|\bWAVE\b/i.test(text)) return ProviderCode.WAVEPAY;
    if (/KBZPAY|KBZ\s*PAY/i.test(text)) return ProviderCode.KBZPAY;
    return null;
  }

  private parseReceiptDateTime(date: string | null, time: string | null): Date | null {
    if (!date || !time) return null;
    const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!dateMatch || !timeMatch) return null;
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const meridiem = timeMatch[3].toUpperCase();
    if (meridiem === 'PM' && hour !== 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    const localMillis = Date.UTC(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      hour,
      minute,
    );
    return new Date(localMillis - 6.5 * 60 * 60 * 1000);
  }

  private async failToReview(
    screenshotId: string,
    batchId: string | undefined,
    reasonCode: string,
    ocrResult: OcrEngineResult,
    provider: ProviderCode | null,
  ) {
    await this.prisma.paymentScreenshot.update({
      where: { id: screenshotId },
      data: { status: 'PENDING_REVIEW', detectedProvider: provider as unknown as PrismaProvider },
    });
    if (batchId) {
      await this.prisma.verificationResult.create({
        data: {
          batchId,
          screenshotId,
          provider: provider as unknown as PrismaProvider,
          status: 'OPEN',
          reasonCode,
          candidateSnapshot: { ocrTextAvailable: Boolean(ocrResult.text) },
          ruleVersion: this.config.get<string>('verification.ruleVersion') ?? '1.0.0',
        },
      });
    }
    return { screenshotId, status: 'PENDING_REVIEW', reasonCode };
  }

  private async markPendingReview(
    screenshotId: string,
    batchId: string | undefined,
    ocrResultId: string,
    reasonCode: string,
  ) {
    await this.prisma.paymentScreenshot.update({
      where: { id: screenshotId },
      data: { status: 'PENDING_REVIEW' },
    });
    if (batchId) {
      await this.prisma.verificationResult.create({
        data: {
          batchId,
          screenshotId,
          status: 'OPEN',
          reasonCode,
          candidateSnapshot: { ocrResultId },
          ruleVersion: this.config.get<string>('verification.ruleVersion') ?? '1.0.0',
        },
      });
    }
    return { screenshotId, status: 'PENDING_REVIEW', reasonCode };
  }
}
