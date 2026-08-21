export default () => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Yangon',
  databaseUrl: process.env.DATABASE_URL ?? '',
  storage: {
    endpoint: process.env.S3_ENDPOINT ?? '',
    bucket: process.env.R2_BUCKET_NAME ?? process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? 'auto',
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
