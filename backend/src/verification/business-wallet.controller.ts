import { Body, Controller, Get, Put, Param, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/auth.guards';
import { ProviderCode } from '../common/enums/domain.enums';
import { BusinessWalletService } from './business-wallet.service';
import { UpsertBusinessWalletBodyDto } from './business-wallet.dto';

@Controller({ path: 'settings/business-wallets', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BusinessWalletController {
  constructor(private readonly service: BusinessWalletService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Put(':provider')
  upsert(
    @Param('provider') provider: ProviderCode,
    @Body() body: UpsertBusinessWalletBodyDto,
  ) {
    return this.service.upsert({ ...body, provider });
  }
}
