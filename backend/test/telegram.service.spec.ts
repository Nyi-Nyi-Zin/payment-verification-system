import { TelegramService } from '../src/telegram/telegram.service';

describe('TelegramService', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'telegram.botToken': 'bot-token',
        'telegram.webhookSecret': 'webhook-secret',
        'telegram.apiBaseUrl': 'https://api.telegram.org',
      };
      return values[key] ?? '';
    }),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a webhook with an invalid secret', async () => {
    const prisma = { telegramUpdate: { create: jest.fn() } };
    const storage = { putObject: jest.fn() };
    const service = new TelegramService(prisma as never, storage as never, config as never);

    await expect(
      service.handleWebhook({ update_id: 1 }, 'wrong-secret'),
    ).rejects.toThrow('Invalid Telegram webhook secret');
    expect(prisma.telegramUpdate.create).not.toHaveBeenCalled();
  });

  it('acknowledges duplicate updates without downloading a file', async () => {
    const prisma = {
      telegramUpdate: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const storage = { putObject: jest.fn() };
    const service = new TelegramService(prisma as never, storage as never, config as never);

    await expect(service.handleWebhook({ update_id: 2 }, 'webhook-secret')).resolves.toEqual({
      ok: true,
      status: 'duplicate',
    });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('ignores updates without a photo and records the result', async () => {
    const prisma = {
      telegramUpdate: {
        create: jest.fn().mockResolvedValue({ id: 'update-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const storage = { putObject: jest.fn() };
    const service = new TelegramService(prisma as never, storage as never, config as never);

    await expect(service.handleWebhook({ update_id: 3 }, 'webhook-secret')).resolves.toEqual({
      ok: true,
      status: 'ignored',
    });
    expect(prisma.telegramUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'IGNORED', processedAt: expect.any(Date) } }),
    );
  });

  it('downloads and stores the largest Telegram photo', async () => {
    const prisma = {
      telegramUpdate: {
        create: jest.fn().mockResolvedValue({ id: 'update-2' }),
        update: jest.fn().mockResolvedValue({}),
      },
      telegramUser: {
        upsert: jest.fn().mockResolvedValue({ id: 'telegram-user-1' }),
      },
      paymentScreenshot: {
        create: jest.fn().mockResolvedValue({ id: 'screenshot-1' }),
      },
    };
    const storage = { putObject: jest.fn().mockResolvedValue({}) };
    const service = new TelegramService(prisma as never, storage as never, config as never);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { file_path: 'photos/large.jpg' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      } as Response);

    const result = await service.handleWebhook(
      {
        update_id: 4,
        message: {
          message_id: 10,
          from: { id: 20, username: 'customer' },
          chat: { id: 30 },
          photo: [
            { file_id: 'small', file_unique_id: 's', width: 100, height: 100, file_size: 100 },
            { file_id: 'large', file_unique_id: 'l', width: 1000, height: 1000, file_size: 1000 },
          ],
        },
      },
      'webhook-secret',
    );

    expect(result).toEqual({ ok: true, status: 'accepted', screenshotId: 'screenshot-1' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('file_id=large'),
      expect.any(Object),
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringContaining('telegram/30/4-') }),
    );
    expect(prisma.paymentScreenshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ telegramUpdateId: BigInt(4), telegramMessageId: BigInt(10) }),
      }),
    );
  });
});
