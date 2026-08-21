# Architecture Review Summary

## Overall Assessment

The original document had a strong end-to-end structure and correctly established a provider-aware, batch verification model. The main implementation risks were not in the high-level architecture, but in edge-case handling, status transitions, idempotency boundaries, transaction reservation, time normalization, and the definition of the open items. The verification trigger has now been clarified as both daytime on-demand and scheduled, rather than nightly-only.

## Key Improvements Made

| Area | Improvement |
|---|---|
| Provider handling | Added canonical provider enum, display aliases, submitted-vs-detected provider fields, and ambiguity handling. |
| Telegram idempotency | Clarified update-level idempotency and distinguished message/media identity from file-hash duplicate submissions. |
| Import reliability | Added file checksum, parser version, import row errors, partial-success status, and replay protection. |
| Time handling | Distinguished Myanmar business date, local timestamp, and UTC instant; added midnight-boundary concerns. |
| Worker behavior | Added explicit processing state, leases/locks, resumability, manual/scheduled triggers, active-scope locking, and batch partial-failure handling. |
| Matching policy | Clarified Level 1/2/3 rules, candidate ambiguity, amount/currency checks, rule snapshots, and no cross-provider matching. |
| Duplicate safety | Added atomic transaction reservation and database constraints to prevent race-condition double use. |
| Database schema | Added nullable external transaction ID handling, partial uniqueness, import errors, raw-row retention, confidence snapshots, and review fields. |
| Admin review | Added explicit manual actions, reason/comment capture, permissions, and audit requirements. |
| Security/privacy | Expanded retention, deletion, presigned URL, secret management, backup/restore, and sensitive-data controls. |
| Open items | Reorganized into Priority 0 blocking inputs, Priority 1 business rules, and Priority 2 operational/security decisions. |

## Most Important Decisions Still Required

1. Approve the Level 2 tolerance configuration for each provider, including before/after windows and midnight behavior.
2. Confirm the allowed daytime on-demand run policy, scheduled run times, schedule timezone, and duplicate-run behavior for the same provider/date scope.
3. Collect actual KBZPay, AYA Pay, and WavePay export files and representative screenshot fixtures.
4. Decide the canonical ORM and migration tool for NestJS/PostgreSQL.
5. Define the business-date cutoff and treatment of late-night or cross-midnight transactions.
6. Approve auto-verification thresholds and the manual-review permission matrix.
7. Define data-retention, backup/restore, and production deployment ownership.

## Recommended Next Step

Treat the Priority 0 items as the implementation-readiness gate. First confirm the manual/scheduled trigger policy and collect the real samples. Then create parser fixtures and OCR fixtures, and validate tolerance and matching rules against those fixtures before finalizing provider-specific regexes or enabling auto-verification in production.
