import { AdminController } from "./admin.controller";
import { ScreenshotService } from "./screenshot.service";
import { Module } from "@nestjs/common";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";
import { BusinessWalletController } from "./business-wallet.controller";
import { BusinessWalletService } from "./business-wallet.service";
import { StatusTransitionService } from "./status.transitions";
import { TransactionReservationService } from "./transaction.reservation.service";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";
import { OcrVerificationService } from "./ocr-verification.service";
import { OcrVerificationController } from "./ocr-verification.controller";

@Module({
  controllers: [
    AdminController,
    VerificationController,
    BusinessWalletController,
    ReviewController,
    OcrVerificationController,
  ],
  providers: [
    ScreenshotService,
    VerificationService,
    BusinessWalletService,
    StatusTransitionService,
    TransactionReservationService,
    ReviewService,
    OcrVerificationService,
  ],
  exports: [
    VerificationService,
    BusinessWalletService,
    StatusTransitionService,
    TransactionReservationService,
    ReviewService,
    OcrVerificationService,
  ],
})
export class VerificationModule {}
