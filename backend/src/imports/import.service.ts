import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../database.prisma";
import { S3Storage } from "../storage/s3.storage";
import { ProviderRegistry } from "../providers/provider-registry";
import { ProviderCode } from "../common/enums/domain.enums";
import { businessDate } from "../common/business-date";
import { CreateImportDto } from "./import.dto";

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
    private readonly providers: ProviderRegistry,
  ) {}

  async stageUpload(
    dto: CreateImportDto,
    file: Express.Multer.File | undefined,
    uploadedById: string,
  ) {
    if (dto.provider !== ProviderCode.KBZPAY)
      throw new BadRequestException(
        "The MVP imports KBZPay Excel history only",
      );
    const date = businessDate(dto.businessDate);
    if (!uploadedById || !file?.buffer?.length)
      throw new BadRequestException(
        "An authenticated uploader and export file are required",
      );
    if (
      !/\.xlsx$/i.test(file.originalname) ||
      file.buffer.subarray(0, 2).toString() !== "PK"
    ) {
      throw new BadRequestException("Upload a KBZPay .xlsx export");
    }
    const fileHash = createHash("sha256").update(file.buffer).digest("hex");
    const duplicate = await this.prisma.paymentImport.findUnique({
      where: { provider_fileHash: { provider: dto.provider, fileHash } },
    });
    if (duplicate) return this.summary(duplicate, true);
    const parser = this.providers.getParser(dto.provider);
    let parsed;
    try {
      parsed = await parser.parse(
        file.buffer,
        file.originalname,
        dto.businessDate,
      );
    } catch {
      throw new BadRequestException("The Excel workbook could not be read");
    }
    if (parsed.totalRows > 5000)
      throw new BadRequestException("Import at most 5,000 rows per file");
    if (!parsed.transactions.length) {
      throw new BadRequestException({
        message:
          "No valid transactions found. Check the export format and business date.",
        errors: parsed.errors.slice(0, 20),
      });
    }
    const references = new Map<string, string>();
    for (const item of parsed.transactions) {
      if (!item.externalTransactionId) continue;
      const signature = [
        item.amount,
        item.direction,
        item.transactionAtUtc.toISOString(),
      ].join("|");
      const previous = references.get(item.externalTransactionId);
      if (previous && previous !== signature)
        throw new BadRequestException(
          "Conflicting rows share a transaction ID; import cancelled",
        );
      references.set(item.externalTransactionId, signature);
    }
    const storageKey = `imports/KBZPAY/${dto.businessDate}/${fileHash}.xlsx`;
    await this.storage.putObject({
      key: storageKey,
      body: file.buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize provider imports, including overlapping files.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('import:KBZPAY'))`;
        const existingFile = await tx.paymentImport.findUnique({
          where: { provider_fileHash: { provider: dto.provider, fileHash } },
        });
        if (existingFile) return this.summary(existingFile, true);
        const history = await tx.paymentTransaction.findMany({
          where: {
            provider: dto.provider,
            OR: [
              { businessDate: date },
              { externalTransactionId: { in: [...references.keys()] } },
            ],
          },
        });
        const byId = new Map(
          history
            .filter((t) => t.externalTransactionId)
            .map((t) => [t.externalTransactionId!, t]),
        );
        const fingerprints = new Set(history.map((t) => t.fingerprint));
        const record = await tx.paymentImport.create({
          data: {
            provider: dto.provider,
            businessDate: date,
            fileName: file.originalname.slice(0, 255),
            storageKey,
            fileHash,
            parserVersion: parser.version,
            uploadedById,
            totalRows: parsed.totalRows,
            status: "PARSING",
          },
        });
        const rows: Prisma.PaymentTransactionCreateManyInput[] = [];
        let inserted = 0;
        let skipped = 0;
        const seenIds = new Set<string>();
        for (const item of parsed.transactions) {
          if (item.externalTransactionId) {
            const previous = byId.get(item.externalTransactionId);
            if (
              previous &&
              (previous.amount.toFixed(2) !== item.amount ||
                previous.direction !== item.direction ||
                previous.transactionAtUtc.getTime() !==
                  item.transactionAtUtc.getTime())
            ) {
              throw new BadRequestException(
                "An existing transaction ID has conflicting amount, direction or time; import cancelled",
              );
            }
            if (previous || seenIds.has(item.externalTransactionId)) {
              skipped++;
              continue;
            }
          }
          if (fingerprints.has(item.fingerprint)) {
            skipped++;
            continue;
          }
          const { rawRow, businessDate: _date, ...fields } = item;
          rows.push({
            ...fields,
            businessDate: date,
            sourceImportId: record.id,
            rawRowJson: JSON.parse(
              JSON.stringify(rawRow),
            ) as Prisma.InputJsonValue,
          });
          fingerprints.add(item.fingerprint);
          if (item.externalTransactionId)
            seenIds.add(item.externalTransactionId);
          inserted++;
        }
        if (rows.length) await tx.paymentTransaction.createMany({ data: rows });
        if (parsed.errors.length)
          await tx.paymentImportError.createMany({
            data: parsed.errors.map((error) => ({
              importId: record.id,
              sourceRowNumber: error.sourceRowNumber,
              errorCode: error.errorCode,
              errorMessage: error.errorMessage,
              rawRowReference: error.rawRow
                ? JSON.parse(JSON.stringify(error.rawRow))
                : undefined,
            })),
          });
        const completed = await tx.paymentImport.update({
          where: { id: record.id },
          data: {
            parsedRows: inserted,
            errorRows: parsed.errors.length,
            status: parsed.errors.length
              ? "COMPLETED_WITH_ERRORS"
              : "COMPLETED",
            completedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: uploadedById,
            action: "IMPORT_COMPLETED",
            entityType: "PaymentImport",
            entityId: record.id,
            newValueJson: { inserted, skipped, errors: parsed.errors.length },
          },
        });
        return { ...this.summary(completed, false), skippedRows: skipped };
      },
      { timeout: 60000 },
    );
  }

  private summary(
    record: {
      id: string;
      status: string;
      parsedRows: number;
      errorRows: number;
    },
    duplicate: boolean,
  ) {
    return {
      importId: record.id,
      status: record.status,
      parsedRows: record.parsedRows,
      errorRows: record.errorRows,
      duplicate,
    };
  }
}
