import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database.prisma';
import { S3Storage } from '../storage/s3.storage';
import { CreateImportDto } from './import.dto';

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
  ) {}

  async stageUpload(
    dto: CreateImportDto,
    file: Express.Multer.File | undefined,
    uploadedById: string,
  ) {
    if (!uploadedById) {
      throw new BadRequestException('Authenticated uploader is required');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty export file is required');
    }

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.paymentImport.findFirst({
      where: { provider: dto.provider as never, fileHash },
      select: { id: true, status: true },
    });
    if (duplicate) {
      return { importId: duplicate.id, status: duplicate.status, duplicate: true };
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `imports/${dto.provider}/${dto.businessDate}/${fileHash}-${safeName}`;
    await this.storage.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimetype || 'application/octet-stream',
      metadata: { provider: dto.provider, businessDate: dto.businessDate },
    });

    const paymentImport = await this.prisma.paymentImport.create({
      data: {
        provider: dto.provider as never,
        businessDate: this.parseDateOnly(dto.businessDate),
        fileName: file.originalname,
        storageKey,
        fileHash,
        parserVersion: 'pending',
        status: 'UPLOADED',
        uploadedById,
      },
      select: { id: true, status: true },
    });

    return { importId: paymentImport.id, status: paymentImport.status, duplicate: false };
  }

  private parseDateOnly(value: string): Date {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid business date: ${value}`);
    }
    return date;
  }
}
