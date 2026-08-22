import { Injectable } from '@nestjs/common';
import { Prisma, Provider as PrismaProvider } from '@prisma/client';
import { PrismaService } from '../database.prisma';
import {
  BusinessWalletConfigView,
  UpsertBusinessWalletDto,
} from './business-wallet.dto';
import { DirectionClassifier } from './direction.classifier';

@Injectable()
export class BusinessWalletService {
  private readonly classifier = new DirectionClassifier();

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BusinessWalletConfigView[]> {
    const configs = await this.prisma.businessWalletConfig.findMany({
      orderBy: { provider: 'asc' },
    });
    return configs.map((config) => this.toView(config));
  }

  async upsert(dto: UpsertBusinessWalletDto): Promise<BusinessWalletConfigView> {
    const data = {
      accountName: dto.accountName.trim(),
      normalizedAccountName: this.classifier.normalizeName(dto.accountName),
      phoneNumber: dto.phoneNumber?.trim() || null,
      normalizedPhoneNumber: dto.phoneNumber
        ? this.classifier.normalizePhone(dto.phoneNumber)
        : null,
      allowOutgoingAutoVerify: dto.allowOutgoingAutoVerify ?? false,
    };

    const config = await this.prisma.businessWalletConfig.upsert({
      where: { provider: dto.provider as unknown as PrismaProvider },
      create: {
        ...data,
        provider: dto.provider as unknown as PrismaProvider,
      },
      update: data,
    });

    return this.toView(config);
  }

  private toView(config: {
    provider: PrismaProvider;
    accountName: string;
    phoneNumber: string | null;
    allowOutgoingAutoVerify: boolean;
  }): BusinessWalletConfigView {
    return {
      provider: config.provider as unknown as BusinessWalletConfigView['provider'],
      accountName: config.accountName,
      phoneNumber: config.phoneNumber,
      allowOutgoingAutoVerify: config.allowOutgoingAutoVerify,
    };
  }
}
