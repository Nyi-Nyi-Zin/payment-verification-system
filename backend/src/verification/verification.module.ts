import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { BusinessWalletController } from './business-wallet.controller';
import { BusinessWalletService } from './business-wallet.service';
import { StatusTransitionService } from './status.transitions';
import { TransactionReservationService } from './transaction.reservation.service';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  controllers: [VerificationController, BusinessWalletController, ReviewController],
  providers: [
    VerificationService,
    BusinessWalletService,
    StatusTransitionService,
    TransactionReservationService,
    ReviewService,
  ],
  exports: [
    VerificationService,
    BusinessWalletService,
    StatusTransitionService,
    TransactionReservationService,
    ReviewService,
  ],
})
export class VerificationModule {}
