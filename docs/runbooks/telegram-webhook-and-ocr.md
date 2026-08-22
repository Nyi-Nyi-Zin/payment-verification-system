# Telegram Webhook and OCR Verification Runbook

**Version:** 1.0.0

## Webhook flow

The Telegram webhook accepts a Telegram `Update`, validates the `X-Telegram-Bot-Api-Secret-Token` header, persists the `update_id` before processing, ignores non-photo updates, selects the largest photo size, downloads the file through Telegram's Bot API, stores the private object in R2/MinIO, and creates a `PaymentScreenshot` record. Repeated delivery of the same `update_id` returns an idempotent duplicate response.

The endpoint is:

```text
POST /telegram/webhook
```

The route is intentionally not protected by the admin JWT guard because Telegram is the event source. Its protection is the webhook secret header, HTTPS termination, request-size limits, and persisted `update_id` idempotency. Telegram's official Bot API documents the `secret_token` setting and the `X-Telegram-Bot-Api-Secret-Token` header [1]. Telegram also requires a valid SSL certificate for webhooks, does not support redirects, and supports ports 443, 80, 88, and 8443 [2].

## Configure the webhook

Set the following environment variables on the deployed backend:

```text
TELEGRAM_BOT_TOKEN=<secret bot token>
TELEGRAM_WEBHOOK_SECRET=<long random secret>
TELEGRAM_WEBHOOK_PATH=telegram/webhook
```

Register the webhook from a secure administration environment. Do not commit the token or secret and do not place them in a mobile application.

```bash
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://<api-domain>/telegram/webhook" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode "allowed_updates=[\"message\"]"
```

The deployment must expose HTTPS directly at the configured URL; redirects should not be placed in front of the webhook route. The service should return HTTP 200 quickly after intake. Telegram's FAQ describes either making a Bot API request after receiving an update or returning a Bot API method payload directly [2].

## OCR flow

A durable worker or an authenticated operator calls:

```text
POST /api/v1/verification/screenshots/:screenshotId/process?batchId=<optional-batch-id>
```

The processing stages are:

1. Load the private screenshot object from storage.
2. Send the image to the configured Google Vision OCR adapter.
3. Detect the provider from an explicit submitted provider or OCR text.
4. Route to the provider extractor. AYA Pay extracts sender/receiver fields; WavePay extracts recipient, amount, fee, transaction ID, status, and date/time.
5. Load the provider's `BusinessWalletConfig` and classify direction. Missing configuration, no identity match, or both-side match returns `UNKNOWN`.
6. Persist OCR fields and confidence values.
7. Match only within the same provider and direction. Unknown direction, disallowed outgoing transactions, ambiguous candidates, missing transaction time, and missing provider history remain in manual review.
8. Persist the verification result with rule version and tolerance snapshot.

The current default is **review-first**. Provider wallet identities and the Level 2 tolerance window must be configured before production auto-verification is enabled.

## Operational prerequisites

The following are still required before production operation:

| Requirement | Reason |
|---|---|
| Public HTTPS deployment | Telegram webhook delivery requires valid SSL and a supported port. |
| Telegram bot token and webhook secret | Required for Bot API file retrieval and request authentication. |
| R2/MinIO credentials and bucket | Required for private screenshot storage. |
| Google Vision API configuration | Required for OCR text extraction. |
| Durable worker or queue runner | Recommended so OCR retries do not depend on the webhook request lifecycle. |
| Business wallet name/phone for each provider | Required for direction classification. |
| AYA Pay and WavePay history exports | Required to validate screenshot transactions against authoritative wallet history. |

## References

[1]: https://core.telegram.org/bots/api "Telegram Bot API"
[2]: https://core.telegram.org/bots/faq "Bots FAQ"
