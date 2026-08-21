import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database.prisma';
import { ProviderCode, TriggerType } from '../common/enums/domain.enums';
import { StartVerificationDto } from './verification.dto';

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async startBatch(
    dto: StartVerificationDto,
    createdById?: string,
  ): Promise<{ batchId: string; status: string }> {
    const businessDate = this.parseDateOnly(dto.businessDate);
    const dateRangeEnd = dto.dateRangeEnd
      ? this.parseDateOnly(dto.dateRangeEnd)
      : null;

    const activeBatch = await this.prisma.verificationBatch.findFirst({
      where: {
        status: { in: ['CREATED', 'RUNNING'] },
        businessDate,
        dateRangeEnd,
      },
      select: { id: true },
    });

    if (activeBatch) {
      throw new ConflictException(
        'An active verification batch already exists for this date scope',
      );
    }

    const batch = await this.prisma.verificationBatch.create({
      data: {
        businessDate,
        dateRangeEnd,
        status: 'CREATED',
        triggerType: dto.triggerType as 'MANUAL' | 'SCHEDULED',
        providerScope: dto.providers as unknown as never,
        createdById,
        configSnapshot: {
          ruleVersion: '1.0.0',
          triggerType: dto.triggerType,
          providers: dto.providers,
        },
      },
      select: { id: true, status: true },
    });

    return { batchId: batch.id, status: batch.status };
  }

  private parseDateOnly(value: string): Date {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }
    return date;
  }

  normalizeProviders(providers: ProviderCode[]): ProviderCode[] {
    return [...new Set(providers)];
  }

  normalizeTriggerType(triggerType: TriggerType): TriggerType {
    return triggerType;
  }
}
