import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/auth.guards';
import { StartVerificationDto } from './verification.dto';
import { VerificationService } from './verification.service';

@Controller({ path: 'verification', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('batches')
  startBatch(
    @Body() dto: StartVerificationDto,
    @Req() request: Request & { user?: AuthenticatedUser },
  ) {
    return this.verificationService.startBatch(dto, request.user?.id);
  }
}
