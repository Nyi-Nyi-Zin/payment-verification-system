import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { TelegramService, TelegramUpdate } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    return this.telegramService.handleWebhook(update, secret);
  }
}
