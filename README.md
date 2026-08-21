# Payment Verification System

A provider-aware payment verification system for KBZPay, AYA Pay, and WavePay.

The current architecture supports Telegram screenshot collection, provider export import, OCR extraction, on-demand verification during the day, scheduled verification runs, duplicate detection, manual review, and reporting.

## Repository Status

This repository currently contains the approved architecture baseline and review notes. Application implementation will follow the implementation-readiness gates described in [`docs/payment-verification-architecture.md`](docs/payment-verification-architecture.md).

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
