# Security and Verification Safety Baseline

## Authentication and RBAC

Sensitive verification and business-wallet configuration routes require a valid bearer JWT. The token payload must contain a user ID and one of the supported roles: `ADMIN`, `REVIEWER`, or `OPERATOR`.

| Operation | Allowed role |
|---|---|
| Start verification batch | `ADMIN`, `OPERATOR` |
| Read/update business wallet configuration | `ADMIN` |
| Manual review actions | `ADMIN`, `REVIEWER` |
| User and permission administration | `ADMIN` |

JWT secrets are loaded from environment configuration and must not be committed. A production login/token-issuance flow still needs to be connected to the selected user credential policy; the current baseline verifies bearer tokens and enforces route roles.

## Business Wallet Direction Rules

Each provider requires one configured business wallet identity containing an account name and, when available, a phone number. Names and phones are normalized before comparison. The classifier uses exact normalized equality against sender and receiver fields.

| Match result | Direction | Automatic verification |
|---|---|---|
| Business identity matches receiver only | `INCOMING` | Eligible, subject to amount/time/status rules |
| Business identity matches sender only | `OUTGOING` | Review by default; allowed only when explicitly configured |
| Matches both sides | `UNKNOWN` | Never auto-verify |
| Matches neither side | `UNKNOWN` | Never auto-verify |

For AYA Pay, OCR extracts both sender and receiver parties first. The direction classifier then applies the configured wallet identity. The OCR extractor itself does not guess direction from transaction type.

For KBZPay Excel, `Credit > 0` and zero debit means `INCOMING`; negative debit and zero credit means `OUTGOING`. Rows where both or neither side identifies a single direction are sent to review. Opening balance rows are excluded.

## Status Safety

Screenshot and batch status changes are validated against explicit transition maps. Terminal states cannot be silently reopened. Reprocessing must be an explicit action that is audited.

## Transaction Reservation

Before a successful verification is finalized, the selected wallet transaction must be reserved inside a database transaction. The provider must match the selected transaction, and a uniqueness conflict on the used-transaction record must route the case to duplicate handling rather than silently reusing the transaction.

## Remaining Production Work

The following items remain before production use: connect the login/token-issuance flow; add an authenticated request context to every review and import route; create and run database migrations in the target environment; configure real business wallet identities for all three providers; supply AYA Pay history export and WavePay samples; and approve the Level 2 tolerance and successful-incoming-only policy.
