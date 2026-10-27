import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../database.prisma";
import { businessDate } from "../common/business-date";
import { ProviderCode, TriggerType } from "../common/enums/domain.enums";
import { StartVerificationDto } from "./verification.dto";
import { OcrVerificationService } from "./ocr-verification.service";

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ocr: OcrVerificationService,
  ) {}
  async startBatch(dto: StartVerificationDto, createdById?: string) {
    if (
      dto.triggerType !== TriggerType.MANUAL ||
      dto.providers.length !== 1 ||
      dto.providers[0] !== ProviderCode.KBZPAY
    ) {
      throw new BadRequestException("The MVP supports manual KBZPay runs only");
    }
    const date = businessDate(dto.businessDate);
    if (dto.dateRangeEnd && dto.dateRangeEnd !== dto.businessDate)
      throw new BadRequestException("Run one business date at a time");
    const batch = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`batch:KBZPAY:${dto.businessDate}`}))`;
      if (
        await tx.verificationBatch.findFirst({
          where: { businessDate: date, status: { in: ["CREATED", "RUNNING"] } },
        })
      ) {
        throw new ConflictException(
          "A verification batch is already active for this date",
        );
      }
      return tx.verificationBatch.create({
        data: {
          businessDate: date,
          status: "RUNNING",
          triggerType: "MANUAL",
          providerScope: ["KBZPAY"],
          createdById,
          startedAt: new Date(),
          configSnapshot: { mode: "REVIEW_ONLY" },
        },
      });
    });
    try {
      const screenshots = await this.prisma.paymentScreenshot.findMany({
        where: {
          businessDate: date,
          submittedProvider: "KBZPAY",
          status: { in: ["RECEIVED", "PENDING_REVIEW", "FAILED", "UNMATCHED"] },
        },
        take: 20,
        orderBy: { receivedAt: "asc" },
      });
      let failed = 0;
      for (const screenshot of screenshots) {
        try {
          await this.ocr.processScreenshot(
            screenshot.id,
            batch.id,
            createdById,
          );
        } catch {
          failed++;
        }
      }
      const status = failed ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: {
          status,
          totalScreenshots: screenshots.length,
          processed: screenshots.length,
          pendingReview: screenshots.length - failed,
          failed,
          completedAt: new Date(),
        },
      });
      return {
        batchId: batch.id,
        status,
        processed: screenshots.length,
        failed,
        mode: "REVIEW_ONLY",
      };
    } catch (error) {
      await this.prisma.verificationBatch.update({
        where: { id: batch.id },
        data: { status: "FAILED", completedAt: new Date() },
      });
      throw error;
    }
  }
  normalizeProviders(providers: ProviderCode[]) {
    return [...new Set(providers)];
  }
  normalizeTriggerType(triggerType: TriggerType) {
    return triggerType;
  }
}
