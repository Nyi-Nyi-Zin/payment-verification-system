# Telegram Webhook Research Notes

**Source review date:** 2026-08-22

Telegram's official Bot API documents a `secret_token` option for `setWebhook`; when configured, Telegram sends the value in the `X-Telegram-Bot-Api-Secret-Token` header. The webhook endpoint must use a valid SSL certificate, redirects are not supported, and supported webhook ports are 443, 80, 88, and 8443. Telegram's official FAQ also describes responding to an update either by issuing a Bot API request or by returning a Bot API method payload directly in the webhook response.

Implementation decision: expose a dedicated HTTPS webhook route, validate the secret header using constant-time comparison, acknowledge duplicate `update_id` deliveries idempotently, persist the update before processing, and enqueue screenshot processing after returning a fast success response. Store Telegram `update_id`, chat ID, message ID, file ID, and raw update metadata for audit/idempotency. Do not trust the sender's displayed username as a business identity; direction is determined later from provider-aware OCR plus configured wallet identity.

## References

[1]: https://core.telegram.org/bots/api "Telegram Bot API"
[2]: https://core.telegram.org/bots/faq "Bots FAQ"
