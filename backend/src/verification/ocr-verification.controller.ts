import {
  Controller,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/auth.guards';
import { Roles } from '../auth/auth.decorators';
import { OcrVerificationService } from './ocr-verification.service';

@Controller({ path: 'verification/screenshots', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class OcrVerificationController {
  constructor(private readonly service: OcrVerificationService) {}

  @Post(':screenshotId/process')
  process(
    @Param('screenshotId') screenshotId: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.service.processScreenshot(screenshotId, batchId);
  }
}
