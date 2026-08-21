# Implementation Readiness — Version 1.0.0

## Current Baseline

The repository currently contains the consolidated architecture and review notes for a provider-aware payment verification system covering KBZPay, AYA Pay, and WavePay. The execution model supports both **admin-triggered on-demand verification** during the day or night and **scheduled verification**. It is not restricted to nightly execution.

## Proposed Implementation Sequence

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | Repository and environment baseline | Approved architecture and deployment target |
| 2 | PostgreSQL schema, migrations, and status transition rules | ORM choice and data contract |
| 3 | Telegram webhook, idempotency, and private object-storage upload | Telegram bot credentials and R2/MinIO configuration |
| 4 | Provider import framework and canonical transaction model | Actual export samples from all three providers |
| 5 | OCR pipeline and provider-specific extraction | Representative screenshot samples from all three providers |
| 6 | Matching, tolerance, atomic transaction reservation, and duplicate detection | Approved matching rules and tolerance values |
| 7 | Admin review/report APIs and Flutter screens | Admin role matrix and report requirements |
| 8 | Test fixtures, integration tests, operational runbook, and deployment | All preceding decisions and test data |

## Blocking Inputs Required

The following inputs materially affect implementation and should be supplied before the related component is finalized.

| Priority | Required input | Why it is needed | Suggested default if not specified |
|---|---|---|---|
| P0 | Actual KBZPay export sample | Received Excel and PDF samples; Excel parser contract can now be fixture-tested, but operational confirmation is still needed | Use Excel as primary import; retain PDF as reference/fallback |
| P0 | Actual AYA Pay export sample | AYA screenshot OCR contract is now defined, but export/history matching format is still unknown | Request incoming/history export before finalizing AYA import parser |
| P0 | Actual WavePay export sample | Same as above for WavePay | Do not finalize parser from assumed columns |
| P0 | Screenshot samples for all providers | AYA incoming/outgoing OCR fixtures are available; KBZPay and WavePay screenshot fixtures remain | Keep provider OCR fixture-driven; no final regex until all providers are covered |
| P0 | Level 2 tolerance window | Candidate selection and auto-verification safety | Start in review-only mode; no Level 2 auto-verify |
| P1 | ORM/migration choice | Database implementation and migration files | Prisma unless project preference differs |
| P1 | Telegram bot token and webhook secret | End-to-end webhook integration | Keep integration disabled until supplied securely |
| P1 | R2 credentials or local MinIO decision | Screenshot/import storage | MinIO for local development; R2 for deployment |
| P1 | Google Cloud Vision configuration | OCR integration and credentials | Provide project/service-account setup before OCR integration |
| P1 | Admin role matrix | Approval and override permissions | One admin role for MVP, with all actions audited |
| P1 | Business-date and run policy | Manual/scheduled batch scope and midnight behavior | Asia/Yangon; explicit date/date-range on every run |
| P1 | Business wallet identity | Account name/phone for each provider to derive incoming/outgoing direction | Require configured wallet phone/name before direction-sensitive auto-verification |
| P2 | Retention and backup policy | Data privacy and operations | Keep configurable; do not hard-code deletion behavior |
| P2 | Deployment target | Docker, TLS, secrets, database, and monitoring setup | Docker Compose baseline |

## Recommended Initial Decisions

Until the product owner confirms otherwise, the implementation can use the following reversible defaults: PostgreSQL with Prisma migrations; `Asia/Yangon` as the business timezone; MMK as the initial currency; MinIO for local development; Cloudflare R2 for production object storage; one admin role with audit logging; and review-only behavior for ambiguous Level 2/3 matches.

The verification API should accept an explicit provider scope, business date or date range, and trigger type. A manual request and a scheduled request should create the same `verification_batches` record shape, differing only in `trigger_type` and actor/scheduler metadata. An active-batch lock should prevent accidental concurrent runs for the same provider/date scope.

## What Can Start Before Samples Arrive

The following work is safe to begin without provider samples: repository conventions, environment configuration, database migration structure, authentication/RBAC foundations, Telegram webhook idempotency, R2/MinIO storage abstraction, batch lifecycle and lease handling, audit logging, API contracts, and Flutter navigation/state-management scaffolding.

Provider parser mappings, provider-specific OCR extractors, production matching tolerances, and auto-verification thresholds should remain fixture-driven and should not be treated as final until actual samples have been reviewed.

## Input Submission Guidance

Provider exports and screenshots may contain sensitive personal and transaction information. They should be shared through a restricted channel or a private repository location with access control, not committed to the public repository. Before sharing, mask personal data where masking does not alter the structural information needed for parsing and OCR tests.
