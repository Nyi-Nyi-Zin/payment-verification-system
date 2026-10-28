import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database.prisma";
import { ProviderCode } from "../common/enums/domain.enums";

@Injectable()
export class TransactionReservationService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: {
    provider: ProviderCode;
    transactionId: string;
    screenshotId: string;
  }): Promise<{ reserved: true; transactionId: string }> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import:${input.provider}`}))`;
      const paymentTransaction =
        await transaction.paymentTransaction.findUnique({
          where: { id: input.transactionId },
          select: { id: true, provider: true },
        });

      if (!paymentTransaction) {
        throw new NotFoundException("Payment transaction was not found");
      }

      if (paymentTransaction.provider !== input.provider) {
        throw new ConflictException(
          "Provider scope does not match transaction",
        );
      }

      try {
        await transaction.usedTransaction.create({
          data: {
            provider: input.provider,
            transactionId: paymentTransaction.id,
            screenshotId: input.screenshotId,
          },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code?: string }).code === "P2002"
        ) {
          throw new ConflictException(
            "Payment transaction is already reserved",
          );
        }
        throw error;
      }

      return { reserved: true, transactionId: paymentTransaction.id };
    });
  }
}
