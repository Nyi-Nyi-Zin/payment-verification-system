import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Provider as PrismaProvider, ScreenshotStatus } from '@prisma/client';
import { PrismaService } from '../database.prisma';
import { ProviderCode } from '../common/enums/domain.enums';
import { ReviewAction, ResolveReviewDto } from './review.dto';
import { StatusTransitionService } from './status.transitions';

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StatusTransitionService,
  ) {}

  async resolve(
    screenshotId: string,
    dto: ResolveReviewDto,
    reviewerId: string,
  ) {
    if (!reviewerId) {
      throw new BadRequestException('Reviewer identity is required');
    }

    return this.prisma.$transaction(async (transaction) => {
      const screenshot = await transaction.paymentScreenshot.findUnique({
        where: { id: screenshotId },
        include: { verificationResults: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (!screenshot) {
        throw new NotFoundException('Screenshot was not found');
      }

      const currentStatus = screenshot.status as unknown as ScreenshotStatus;
      const targetStatus = this.targetStatus(dto.action);
      this.transitions.assertScreenshotTransition(currentStatus, targetStatus);

      let transactionId: string | undefined;
      if (dto.action === ReviewAction.APPROVE || dto.action === ReviewAction.MARK_DUPLICATE) {
        if (!dto.transactionId) {
          throw new BadRequestException('A transaction ID is required for this action');
        }
        const selected = await transaction.paymentTransaction.findUnique({
          where: { id: dto.transactionId },
          select: { id: true, provider: true },
        });
        if (!selected) {
          throw new NotFoundException('Selected payment transaction was not found');
        }
        if (
          screenshot.submittedProvider &&
          selected.provider !== (screenshot.submittedProvider as unknown as PrismaProvider)
        ) {
          throw new ConflictException('Selected transaction provider does not match screenshot');
        }
        transactionId = selected.id;

        if (dto.action === ReviewAction.APPROVE) {
          try {
            await transaction.usedTransaction.create({
              data: {
                provider: selected.provider,
                transactionId: selected.id,
                screenshotId,
              },
            });
          } catch (error) {
            if (
              error instanceof Error &&
              'code' in error &&
              (error as { code?: string }).code === 'P2002'
            ) {
              throw new ConflictException('Selected transaction is already used');
            }
            throw error;
          }
        }
      }

      const result = screenshot.verificationResults[0];
      if (result) {
        await transaction.verificationResult.update({
          where: { id: result.id },
          data: {
            status:
              dto.action === ReviewAction.APPROVE
                ? 'APPROVED'
                : dto.action === ReviewAction.MARK_DUPLICATE
                  ? 'MARKED_DUPLICATE'
                  : dto.action === ReviewAction.REJECT
                    ? 'REJECTED'
                    : 'REPROCESSED',
            transactionId,
            reviewedById: reviewerId,
            reviewedAt: new Date(),
            reviewComment: dto.comment,
          },
        });
      }

      await transaction.paymentScreenshot.update({
        where: { id: screenshotId },
        data: { status: targetStatus as never },
      });

      return {
        screenshotId,
        status: targetStatus,
        action: dto.action,
        transactionId: transactionId ?? null,
      };
    });
  }

  private targetStatus(action: ReviewAction): ScreenshotStatus {
    switch (action) {
      case ReviewAction.APPROVE:
        return ScreenshotStatus.VERIFIED;
      case ReviewAction.MARK_DUPLICATE:
        return ScreenshotStatus.DUPLICATE;
      case ReviewAction.REJECT:
        return ScreenshotStatus.REJECTED;
      case ReviewAction.REPROCESS_OCR:
        return ScreenshotStatus.PROCESSING;
    }
  }
}
