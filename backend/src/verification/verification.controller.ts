import { Body, Controller, Post } from '@nestjs/common';
import { StartVerificationDto } from './verification.dto';
import { VerificationService } from './verification.service';

@Controller({ path: 'verification', version: '1' })
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('batches')
  startBatch(@Body() dto: StartVerificationDto) {
    return this.verificationService.startBatch(dto);
  }
}
