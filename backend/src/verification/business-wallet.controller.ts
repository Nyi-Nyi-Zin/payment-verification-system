import { Body, Controller, Get, Put, Param } from '@nestjs/common';
import { ProviderCode } from '../common/enums/domain.enums';
import {
  BusinessWalletService,
} from './business-wallet.service';
import { UpsertBusinessWalletDto } from './business-wallet.dto';

@Controller({ path: 'settings/business-wallets', version: '1' })
export class BusinessWalletController {
  constructor(private readonly service: BusinessWalletService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Put(':provider')
  upsert(
    @Param('provider') provider: ProviderCode,
    @Body() body: Omit<UpsertBusinessWalletDto, 'provider'>,
  ) {
    return this.service.upsert({ ...body, provider });
  }
}
