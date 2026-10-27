import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database.prisma";
import { ReviewAction, ResolveReviewDto } from "./review.dto";
import { StatusTransitionService } from "./status.transitions";

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
    if (!reviewerId)
      throw new BadRequestException("Reviewer identity is required");
    if (dto.action === ReviewAction.APPROVE && dto.confirmed !== true)
      throw new BadRequestException(
        "Confirm comparison with wallet history before approving",
      );
    if (dto.action === ReviewAction.REPROCESS_OCR) {
      throw new BadRequestException(
        "Use the screenshot process endpoint to run OCR again",
      );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PaymentScreenshot" WHERE id = ${screenshotId}::uuid FOR UPDATE`;
        const screenshot = await tx.paymentScreenshot.findUnique({
          where: { id: screenshotId },
          include: {
            verificationResults: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        });
        if (!screenshot)
          throw new NotFoundException("Screenshot was not found");
        if (screenshot.status !== "PENDING_REVIEW")
          throw new ConflictException(
            "Only pending screenshots can be reviewed",
          );
        const result = screenshot.verificationResults[0];
        if (!result)
          throw new BadRequestException(
            "Process the screenshot before reviewing it",
          );
        const provider =
          screenshot.submittedProvider ||
          screenshot.detectedProvider ||
          result.provider;
        if (provider !== "KBZPAY")
          throw new BadRequestException("The MVP reviews KBZPay only");
        const target =
          dto.action === ReviewAction.APPROVE
            ? "VERIFIED"
            : dto.action === ReviewAction.MARK_DUPLICATE
              ? "DUPLICATE"
              : "REJECTED";
        this.transitions.assertScreenshotTransition(screenshot.status, target);
        let transactionId: string | null = null;
        if (dto.action !== ReviewAction.REJECT) {
          if (!dto.transactionId)
            throw new BadRequestException("Select an imported transaction");
          const selected = await tx.paymentTransaction.findUnique({
            where: { id: dto.transactionId },
            include: { usedTransaction: true },
          });
          if (!selected)
            throw new NotFoundException("Selected transaction was not found");
          if (
            selected.provider !== provider ||
            selected.direction !== "INCOMING"
          )
            throw new BadRequestException(
              "Select an incoming KBZPay transaction",
            );
          if (
            screenshot.businessDate &&
            selected.businessDate.getTime() !==
              screenshot.businessDate.getTime()
          ) {
            throw new BadRequestException(
              "Transaction date does not match the receipt business date",
            );
          }
          if (
            dto.action === ReviewAction.MARK_DUPLICATE &&
            !selected.usedTransaction
          )
            throw new BadRequestException(
              "This transaction has not been used; it is not a duplicate",
            );
          if (dto.action === ReviewAction.APPROVE) {
            if (selected.usedTransaction)
              throw new ConflictException(
                "This transaction has already been used",
              );
            if (result.transactionId !== selected.id && !dto.comment?.trim())
              throw new BadRequestException(
                "Add a review note when selecting a different transaction",
              );
            await tx.usedTransaction.create({
              data: { provider, transactionId: selected.id, screenshotId },
            });
          }
          transactionId = selected.id;
        }
        await tx.verificationResult.update({
          where: { id: result.id },
          data: {
            status:
              dto.action === ReviewAction.APPROVE
                ? "APPROVED"
                : dto.action === ReviewAction.MARK_DUPLICATE
                  ? "MARKED_DUPLICATE"
                  : "REJECTED",
            transactionId,
            reviewedById: reviewerId,
            reviewedAt: new Date(),
            reviewComment: dto.comment?.trim(),
            verifiedAt: dto.action === ReviewAction.APPROVE ? new Date() : null,
          },
        });
        await tx.paymentScreenshot.update({
          where: { id: screenshotId },
          data: { status: target },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: reviewerId,
            action: dto.action,
            entityType: "PaymentScreenshot",
            entityId: screenshotId,
            oldValueJson: { status: screenshot.status },
            newValueJson: { status: target, transactionId },
            reason: dto.comment?.trim(),
          },
        });
        return {
          screenshotId,
          status: target,
          action: dto.action,
          transactionId,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "This transaction or screenshot has already been used",
        );
      }
      throw error;
    }
  }
}
