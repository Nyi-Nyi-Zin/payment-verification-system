import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { BusinessWalletController } from './business-wallet.controller';
import { BusinessWalletService } from './business-wallet.service';

@Module({
  controllers: [VerificationController, BusinessWalletController],
  providers: [VerificationService, BusinessWalletService],
  exports: [VerificationService, BusinessWalletService],
})
export class VerificationModule {}
