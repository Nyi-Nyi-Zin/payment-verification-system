export default () => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Yangon',
  databaseUrl: process.env.DATABASE_URL ?? '',
  storage: {
    endpoint: process.env.S3_ENDPOINT ?? '',
    bucket: process.env.R2_BUCKET_NAME ?? process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? 'auto',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    webhookPath: process.env.TELEGRAM_WEBHOOK_PATH ?? 'telegram/webhook',
    apiBaseUrl: process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org',
  },
  ocr: {
    googleVisionApiKey: process.env.GOOGLE_VISION_API_KEY ?? '',
    engineVersion: process.env.OCR_ENGINE_VERSION ?? 'google-vision-text-detection-v1',
  },
  verification: {
    ruleVersion: process.env.MATCHING_RULE_VERSION ?? '1.0.0',
    defaultToleranceBeforeMinutes: Number.parseInt(
      process.env.DEFAULT_TOLERANCE_BEFORE_MINUTES ?? '2',
      10,
    ),
    defaultToleranceAfterMinutes: Number.parseInt(
      process.env.DEFAULT_TOLERANCE_AFTER_MINUTES ?? '2',
      10,
    ),
  },
});
