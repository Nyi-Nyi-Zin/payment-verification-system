import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database.prisma';
import { S3Storage } from '../storage/s3.storage';

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: { id: number; username?: string };
  chat: { id: number };
  photo?: TelegramPhotoSize[];
  caption?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramFileResponse {
  ok: boolean;
  result?: { file_path?: string };
  description?: string;
}

@Injectable()
export class TelegramService {
  private readonly botToken: string;
  private readonly webhookSecret: string;
  private readonly apiBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3Storage,
    config: ConfigService,
  ) {
    this.botToken = config.get<string>('telegram.botToken') ?? '';
    this.webhookSecret = config.get<string>('telegram.webhookSecret') ?? '';
    this.apiBaseUrl = config.get<string>('telegram.apiBaseUrl') ?? 'https://api.telegram.org';
  }

  async handleWebhook(
    update: TelegramUpdate,
    receivedSecret: string | undefined,
  ): Promise<{ ok: true; status: string; screenshotId?: string }> {
    this.assertWebhookSecret(receivedSecret);
    if (!Number.isSafeInteger(update?.update_id)) {
      throw new UnauthorizedException('Invalid Telegram update');
    }

    const updateId = BigInt(update.update_id);
    const message = update.message;
    const rawJson = JSON.parse(JSON.stringify(update)) as object;
    let persisted;
    try {
      persisted = await this.prisma.telegramUpdate.create({
        data: {
          updateId,
          telegramChatId: message?.chat?.id !== undefined ? BigInt(message.chat.id) : null,
          telegramMessageId:
            message?.message_id !== undefined ? BigInt(message.message_id) : null,
          telegramUserId: message?.from?.id !== undefined ? BigInt(message.from.id) : null,
          rawJson,
          status: 'RECEIVED',
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return { ok: true, status: 'duplicate' };
      }
      throw error;
    }

    if (!message?.photo?.length || !message.from?.id || !message.chat?.id) {
      await this.prisma.telegramUpdate.update({
        where: { id: persisted.id },
        data: { status: 'IGNORED', processedAt: new Date() },
      });
      return { ok: true, status: 'ignored' };
    }

    try {
      const photo = this.selectLargestPhoto(message.photo);
      const filePath = await this.getFilePath(photo.file_id);
      const body = await this.downloadFile(filePath);
      const fileHash = createHash('sha256').update(body).digest('hex');
      const telegramUser = await this.prisma.telegramUser.upsert({
        where: { telegramUserId: BigInt(message.from.id) },
        create: {
          telegramUserId: BigInt(message.from.id),
          username: message.from.username ?? null,
        },
        update: { username: message.from.username ?? undefined },
      });
      const storageKey = `telegram/${message.chat.id}/${update.update_id}-${fileHash}.jpg`;
      await this.storage.putObject({
        key: storageKey,
        body,
        contentType: 'image/jpeg',
        metadata: {
          telegramUpdateId: String(update.update_id),
          telegramFileId: photo.file_id,
          fileHash,
        },
      });
      const screenshot = await this.prisma.paymentScreenshot.create({
        data: {
          telegramUpdateId: updateId,
          telegramMessageId: BigInt(message.message_id),
          telegramUserId: telegramUser.id,
          storageKey,
          fileHash,
          mimeType: 'image/jpeg',
          fileSizeBytes: body.length,
          status: 'RECEIVED',
        },
        select: { id: true },
      });
      await this.prisma.telegramUpdate.update({
        where: { id: persisted.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { ok: true, status: 'accepted', screenshotId: screenshot.id };
    } catch (error) {
      await this.prisma.telegramUpdate.update({
        where: { id: persisted.id },
        data: {
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        },
      });
      throw new InternalServerErrorException('Telegram screenshot intake failed');
    }
  }

  private assertWebhookSecret(receivedSecret: string | undefined): void {
    if (!this.webhookSecret || !receivedSecret) {
      throw new UnauthorizedException('Telegram webhook secret is not configured');
    }
    const expected = Buffer.from(this.webhookSecret);
    const actual = Buffer.from(receivedSecret);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
  }

  private selectLargestPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize {
    return [...photos].sort(
      (left, right) =>
        (right.file_size ?? right.width * right.height) -
        (left.file_size ?? left.width * left.height),
    )[0];
  }

  private async getFilePath(fileId: string): Promise<string> {
    this.assertBotToken();
    const response = await fetch(
      `${this.apiBaseUrl}/bot${this.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const payload = (await response.json()) as TelegramFileResponse;
    if (!response.ok || !payload.ok || !payload.result?.file_path) {
      throw new Error(payload.description ?? 'Telegram getFile failed');
    }
    return payload.result.file_path;
  }

  private async downloadFile(filePath: string): Promise<Buffer> {
    this.assertBotToken();
    const response = await fetch(`${this.apiBaseUrl}/file/bot${this.botToken}/${filePath}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Telegram file download failed with HTTP ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) {
      throw new Error('Telegram screenshot size is empty or exceeds the 10 MB intake limit');
    }
    return Buffer.from(bytes);
  }

  private assertBotToken(): void {
    if (!this.botToken) {
      throw new Error('Telegram bot token is not configured');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002',
    );
  }
}
