import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { BusinessWalletController } from './business-wallet.controller';
import { BusinessWalletService } from './business-wallet.service';
import { StatusTransitionService } from './status.transitions';
import { TransactionReservationService } from './transaction.reservation.service';

@Module({
  controllers: [VerificationController, BusinessWalletController],
  providers: [
    VerificationService,
    BusinessWalletService,
    StatusTransitionService,
    TransactionReservationService,
  ],
  exports: [
    VerificationService,
    BusinessWalletService,
    StatusTransitionService,
    TransactionReservationService,
  ],
})
export class VerificationModule {}
