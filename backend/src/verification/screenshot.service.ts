import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ScreenshotStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../database.prisma";
import { S3Storage } from "../storage/s3.storage";
import { businessDate } from "../common/business-date";
import { ProviderCode } from "../common/enums/domain.enums";
import { UploadReceiptDto } from "./receipt.dto";

export function imageMime(bytes: Buffer): string {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  throw new BadRequestException("Upload a PNG, JPEG or WebP screenshot");
}

@Injectable()
export class ScreenshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
  ) {}

  async upload(
    dto: UploadReceiptDto,
    file: Express.Multer.File | undefined,
    actorId: string,
  ) {
    if (dto.provider !== ProviderCode.KBZPAY)
      throw new BadRequestException("The MVP accepts KBZPay screenshots only");
    const date = businessDate(dto.businessDate);
    if (!file?.buffer?.length)
      throw new BadRequestException("A screenshot file is required");
    const mimeType = imageMime(file.buffer);
    const fileHash = createHash("sha256").update(file.buffer).digest("hex");
    const storageKey = `receipts/${fileHash}`;
    await this.storage.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: mimeType,
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fileHash}))`;
      const previous = await tx.paymentScreenshot.findFirst({
        where: { fileHash },
      });
      if (previous)
        return {
          screenshotId: previous.id,
          status: previous.status,
          duplicate: true,
        };
      const receipt = await tx.paymentScreenshot.create({
        data: {
          source: "WEB",
          submittedProvider: dto.provider,
          businessDate: date,
          storageKey,
          fileHash,
          mimeType,
          fileSizeBytes: file.buffer.length,
          status: "PENDING_REVIEW",
        },
      });
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
      await tx.verificationResult.create({
        data: {
          screenshotId: receipt.id,
          batchId: batch.id,
          provider: dto.provider,
          status: "OPEN",
          reasonCode: "AWAITING_RECEIPT_DETAILS",
          ruleVersion: "mvp-review-1",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: "SCREENSHOT_UPLOADED",
          entityType: "PaymentScreenshot",
          entityId: receipt.id,
        },
      });
      return {
        screenshotId: receipt.id,
        status: receipt.status,
        duplicate: false,
      };
    });
  }

  async list(date: string, page = 1, status?: string) {
    const where: Prisma.PaymentScreenshotWhereInput = {
      OR: [
        { submittedProvider: "KBZPAY" },
        { detectedProvider: "KBZPAY" },
        { submittedProvider: null, detectedProvider: null },
      ],
    };
    if (date) where.businessDate = businessDate(date);
    if (status && status !== "ALL") {
      if (!Object.values(ScreenshotStatus).includes(status as ScreenshotStatus))
        throw new BadRequestException("Invalid receipt status");
      where.status = status as ScreenshotStatus;
    }
    const [items, total] = await Promise.all([
      this.prisma.paymentScreenshot.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
        select: {
          id: true,
          status: true,
          source: true,
          submittedProvider: true,
          detectedProvider: true,
          businessDate: true,
          receivedAt: true,
          lastError: true,
          ocrResults: { orderBy: { createdAt: "desc" }, take: 1 },
          verificationResults: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { transaction: true },
          },
        },
      }),
      this.prisma.paymentScreenshot.count({ where }),
    ]);
    return { items, total, page, pageSize: 50 };
  }

  async detail(id: string) {
    const record = await this.prisma.paymentScreenshot.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        source: true,
        businessDate: true,
        submittedProvider: true,
        detectedProvider: true,
        lastError: true,
        mimeType: true,
        receivedAt: true,
        ocrResults: { orderBy: { createdAt: "desc" }, take: 1 },
        verificationResults: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { transaction: true },
        },
      },
    });
    if (!record) throw new NotFoundException("Screenshot was not found");
    return record;
  }

  async image(id: string) {
    const record = await this.prisma.paymentScreenshot.findUnique({
      where: { id },
      select: { storageKey: true, mimeType: true },
    });
    if (!record) throw new NotFoundException("Screenshot was not found");
    return {
      bytes: await this.storage.getObject(record.storageKey),
      mimeType: record.mimeType,
    };
  }
}
