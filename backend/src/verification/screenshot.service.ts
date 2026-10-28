import {
  BadRequestException,
  ConflictException,
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
import { OcrVerificationService } from "./ocr-verification.service";

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
    private readonly comparison: OcrVerificationService,
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
    const uploaded = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fileHash}))`;
        await this.storage.putObject({
          key: storageKey,
          body: file.buffer,
          contentType: mimeType,
        });
        const previous = await tx.paymentScreenshot.findFirst({
          where: { fileHash },
        });
        if (previous)
          return {
            screenshotId: previous.id,
            status: previous.status,
            // A previously blocked receipt may become valid after its original is deleted.
            duplicate: previous.status !== "DUPLICATE",
            businessDate: previous.businessDate?.toISOString().slice(0, 10),
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
            status: "RECEIVED",
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
          businessDate: dto.businessDate,
        };
      },
      { timeout: 15000 },
    );
    if (uploaded.duplicate) return uploaded;
    try {
      return {
        ...uploaded,
        ...(await this.comparison.processScreenshot(
          uploaded.screenshotId,
          undefined,
          actorId,
        )),
      };
    } catch {
      // The upload is durable even if comparison fails; keep it available for retry.
      await this.prisma.paymentScreenshot.updateMany({
        where: {
          id: uploaded.screenshotId,
          status: { in: ["RECEIVED", "PROCESSING"] },
        },
        data: { status: "FAILED", lastError: "COMPARISON_FAILED" },
      });
      return { ...uploaded, status: "FAILED", reasonCode: "COMPARISON_FAILED" };
    }
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

  async remove(id: string, actorId: string) {
    const snapshot = await this.prisma.paymentScreenshot.findUnique({
      where: { id },
    });
    if (!snapshot) return { success: true, deleted: false };
    return this.prisma.$transaction(
      async (tx) => {
        // Use the same lock order as comparison, reservation and import deletion.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('import:KBZPAY'))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${snapshot.fileHash}))`;
        await tx.$queryRaw`SELECT id FROM "PaymentScreenshot" WHERE id = ${id}::uuid FOR UPDATE`;
        const record = await tx.paymentScreenshot.findUnique({ where: { id } });
        if (!record) return { success: true, deleted: false };
        if (record.status === "PROCESSING")
          throw new ConflictException({
            code: "UPLOAD_BUSY",
            message:
              "This receipt is being checked. Try again when checking finishes.",
          });
        if (
          await tx.verificationBatch.findFirst({
            where: {
              status: { in: ["CREATED", "RUNNING"] },
              OR: [
                { results: { some: { screenshotId: id } } },
                ...(record.businessDate
                  ? [{ businessDate: record.businessDate }]
                  : []),
              ],
            },
            select: { id: true },
          })
        )
          throw new ConflictException({
            code: "UPLOAD_BUSY",
            message:
              "A receipt batch is running. Try again when checking finishes.",
          });
        const shared = await tx.paymentScreenshot.count({
          where: { storageKey: record.storageKey, id: { not: id } },
        });
        const results = await tx.verificationResult.findMany({
          where: { screenshotId: id },
          select: { batchId: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actorId,
            action: "SCREENSHOT_DELETED",
            entityType: "PaymentScreenshot",
            entityId: id,
            oldValueJson: {
              status: record.status,
              fileHash: record.fileHash,
              source: record.source,
            },
            reason: "Upload removed; its used-payment claim released",
          },
        });
        await tx.verificationResult.deleteMany({ where: { screenshotId: id } });
        await tx.usedTransaction.deleteMany({ where: { screenshotId: id } });
        // OCR results cascade; other receipts' payment claims remain protected.
        await tx.paymentScreenshot.delete({ where: { id } });
        for (const batchId of new Set(
          results.map((result) => result.batchId),
        )) {
          const counts = await tx.paymentScreenshot.groupBy({
            by: ["status"],
            where: { verificationResults: { some: { batchId } } },
            _count: true,
          });
          const totals = Object.fromEntries(
            counts.map((row) => [row.status, row._count]),
          );
          const total = counts.reduce((sum, row) => sum + row._count, 0);
          await tx.verificationBatch.updateMany({
            where: { id: batchId, status: { notIn: ["CREATED", "RUNNING"] } },
            data: {
              totalScreenshots: total,
              processed: total,
              matched: totals.VERIFIED || 0,
              duplicate: totals.DUPLICATE || 0,
              pendingReview: totals.PENDING_REVIEW || 0,
              unmatched: totals.UNMATCHED || 0,
              failed: totals.FAILED || 0,
            },
          });
        }
        if (!shared) await this.storage.deleteObject(record.storageKey);
        return { success: true, deleted: true };
      },
      { timeout: 15000 },
    );
  }
}
