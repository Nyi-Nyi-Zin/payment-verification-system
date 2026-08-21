# Flutter Admin App Boundary

The Flutter admin client will be implemented after the backend API contract is stable. The initial feature areas are authentication, dashboard, payment import, screenshot review, verification batches, duplicate review, transactions, reports, and settings.

## Required API capabilities

| Feature | Backend contract needed |
|---|---|
| Authentication | Login, refresh, logout, current-user, role/permission response |
| Dashboard | Provider-wise counts by business date and batch status |
| Import | Presigned upload, provider selection, business date, import progress and row errors |
| Verification | Manual batch creation with provider/date scope, scheduled batch status, progress and result summary |
| Review | Screenshot, OCR fields, candidates, approve/reject/duplicate/reprocess actions |
| Reports | Daily/date-range report with provider filters and export options |

The client must not contain Telegram bot tokens, R2 secret keys, Google credentials, or provider parser logic. Object access should use short-lived presigned URLs issued by the backend.
