# Flutter Admin API Contract — Version 1.0.0

## Base URL

```text
/api/v1
```

All endpoints except login and refresh require `Authorization: Bearer <accessToken>`. The app must never contain Telegram, R2, S3, Google Vision, or JWT secret values.

Each account supports one active device. Login replaces the prior session; logout, role/status changes, and password changes/resets immediately invalidate issued access tokens. Refresh rotates the token and never extends the session beyond 30 days after login. Accounts with mustChangePassword=true must call POST /auth/change-password with currentPassword and newPassword before using the workspace, then sign in again. displayName and mustChangePassword are included in identity responses. The /auth/browser/* cookie endpoints are for the web client; native clients retain the token endpoints below.

## Authentication

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Exchange admin identifier and password for access/refresh tokens |
| `POST` | `/auth/refresh` | Rotate the refresh token and receive a new token pair |
| `GET` | `/auth/me` | Load the current admin identity and role |
| `POST` | `/auth/logout` | Revoke the stored refresh-token session |

The app should keep the access token short-lived, rotate refresh tokens on refresh, clear local session data after logout, and route `401` responses through one refresh/retry interceptor.

## Business Wallet Configuration

| Method | Path | Required role | Purpose |
|---|---|---|---|
| `GET` | `/settings/business-wallets` | `ADMIN` | List provider wallet identities and direction policy |
| `PUT` | `/settings/business-wallets/:provider` | `ADMIN` | Update account name, phone number, and outgoing auto-verify flag |

The three provider codes are `KBZPAY`, `AYAPAY`, and `WAVEPAY`. An empty or incomplete identity should be displayed as configuration incomplete. The client should not infer direction locally; it should display the backend classification and reason code.

## Import and Verification

| Method | Path | Required role | Purpose |
|---|---|---|---|
| `POST` | `/imports` | `ADMIN`, `OPERATOR` | Multipart upload with `provider`, `businessDate`, and `file` |
| `POST` | `/verification/batches` | `ADMIN`, `OPERATOR` | Start a manual or scheduled-scope verification batch |

The import response includes `importId`, `status`, and `duplicate`. A duplicate upload should not create another import. The verification request includes the provider list, business date/date range, and `triggerType` (`MANUAL` or `SCHEDULED`).

## UI States

The app should support the following visual states: loading, empty, configuration incomplete, upload in progress, import completed with row errors, batch running, batch completed with errors, pending review, unmatched, duplicate, failed, and unauthorized.

Unknown direction, missing business wallet configuration, ambiguous candidates, and outgoing transactions when outgoing auto-verification is disabled must be shown as review-required states rather than as successful verification.

## Manual Review

| Method | Path | Required role | Purpose |
|---|---|---|---|
| `PATCH` | `/reviews/:screenshotId/resolve` | `ADMIN`, `REVIEWER` | Approve, reject, mark duplicate, or reprocess OCR |

The request contains `action`, optional `transactionId`, and optional `comment`. Approval and duplicate actions require a selected transaction. The backend performs status validation, provider consistency checks, transaction reservation, and audit logging.

## Pending Backend Contract

Review list/detail endpoints, report endpoints, notification registration, and paginated transaction browsing remain to be added after the batch orchestration APIs are finalized.
