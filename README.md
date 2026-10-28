# Payment Verification System

## Web frontend

The `frontend/` app uses Next.js App Router, strict TypeScript, Tailwind CSS v4, TanStack React Query, Zod and React Hook Form. It provides the Myanmar/English blue Payment Desk dashboard. NestJS serves its production static export on the same origin as `/api/v1`; no separate frontend server is needed in production.

```bash
npm --prefix frontend ci
# Install/configure backend dependencies and database as described in the MVP runbook.
npm run build
npm start
```

Open **http://localhost:3000**. `npm run build` exports the frontend, publishes it to ignored `backend/frontend-dist/` with CSP script hashes, then compiles NestJS. Rebuild after frontend changes; the legacy `backend/public/` app has been retired. See [frontend development and verification](frontend/README.md).

## KBZPay automatic comparison

A responsive Web Admin connects Excel history import to private receipt upload, automatic OCR comparison, duplicate detection and an audit trail. Import the complete KBZPay statement, then upload receipts to see Match, Duplicate or No match results.

**Free local Tesseract OCR is the default.** Run `pnpm setup:ocr` in `backend/` to install or upgrade to the English/Myanmar `tessdata_best` models; receipt reading then runs locally without a cloud API, billing account or network access. Restart the backend after upgrading models. Missing or failed OCR is reported separately from No match. A Match means agreement with imported history, not a live bank confirmation. See [setup, workflow and verification](docs/runbooks/mvp.md). The architecture documentation below describes the broader target system.


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

