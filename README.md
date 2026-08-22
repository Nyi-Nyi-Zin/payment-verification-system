# Payment Verification System

A provider-aware payment verification system for KBZPay, AYA Pay, and WavePay.

The current architecture supports Telegram screenshot collection, provider export import, OCR extraction, on-demand verification during the day, scheduled verification runs, duplicate detection, manual review, and reporting. The repository now also includes an initial NestJS/Prisma backend foundation with a deterministic provider-neutral matching engine and unit tests.

## Repository Status

This repository contains the approved architecture baseline and review notes, an initial NestJS/Prisma backend foundation, and a deterministic provider-neutral matching engine. Provider-specific parser/OCR behavior remains fixture-driven and is intentionally not finalized until actual provider samples are supplied. Implementation sequencing and blockers are tracked in [`docs/implementation-readiness.md`](docs/implementation-readiness.md).

## Version

Architecture baseline: **1.0.0**

## Providers

| Provider | Internal code |
|---|---|
| KBZPay | `KBZPAY` |
| AYA Pay | `AYAPAY` |
| WavePay | `WAVEPAY` |

## Key Execution Modes

Verification may be started by an authorized admin on demand during the daytime or nighttime, and may also be started automatically by a configured scheduler. It is not restricted to nightly execution.

## Important Pending Inputs

Before provider-specific parser and OCR rules are finalized, the project requires actual export samples and representative screenshot samples for all three providers. Level 2 matching tolerance, business-date rules, auto-verification thresholds, and review permissions also require approval.

## Documents

- [`docs/payment-verification-architecture.md`](docs/payment-verification-architecture.md)
- [`docs/architecture-review.md`](docs/architecture-review.md)
- [`docs/implementation-readiness.md`](docs/implementation-readiness.md)
- [`docs/runbooks/local-development.md`](docs/runbooks/local-development.md)
- [`docs/runbooks/security-and-verification-safety.md`](docs/runbooks/security-and-verification-safety.md)
- [`docs/runbooks/telegram-webhook-and-ocr.md`](docs/runbooks/telegram-webhook-and-ocr.md)
- [`docs/telegram-webhook-research.md`](docs/telegram-webhook-research.md)
- [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)
- [`mobile/README.md`](mobile/README.md)
- [`mobile/api-contract.md`](mobile/api-contract.md)
- [`docs/provider-sample-analysis-2026-08.md`](docs/provider-sample-analysis-2026-08.md)
