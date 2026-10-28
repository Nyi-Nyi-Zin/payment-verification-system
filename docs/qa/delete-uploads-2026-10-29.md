# Upload deletion verification — 2026-10-29

Receipt images and Excel uploads can be deleted by Admins/Operators through a confirmation dialog. Used-payment claims and transactions referenced by receipt checks survive deletion, preserving duplicate protection. The local database migration was applied and the app rebuilt/restarted.

## Evidence

- Backend unit tests: 63 passed across 14 suites.
- Frontend tests: 22 passed; ESLint and TypeScript/production export passed.
- Import/receipt HTTP and real-Chrome integration: 21 passed, including the parent test. The suite creates/drops its own PostgreSQL schema and temporary local storage; OCR uses an injected adapter.
- API checks: anonymous/Reviewer rejection, processing conflicts, durable receipt/OCR/result deletion, shared-object reference handling, database rollback on a simulated storage-delete failure, idempotent retries, audit entries, unused transaction deletion, retained transaction references, reimport, and duplicate rejection after both receipt and original Excel deletion.
- Browser checks: cancel performs no deletion; confirmation removes duplicate queue rows, selected preview and saved receipt; reload keeps deleted records absent. Excel deletion survives reload, a simulated 503 can be retried in the same dialog, and Myanmar/mobile confirmation and compact horizontally scrolling import rows render without document overflow or runtime errors.
- Earlier uploads: receipt history defaults to all dates; a 2020 fixture is visible without changing the date and can be deleted using the explicit details-header action. The manage-history shortcut clears date/status filters. Desktop/mobile screenshots cover that older receipt.
- Restarted localhost app served `/` and `/api/v1/health` with 200; anonymous DELETE returned 401 without touching an upload.

This is local evidence. Live S3/R2 deletion and production deployment were not exercised.

## Artifacts

- [Receipt confirmation on desktop](../../.qa-tools/delete-uploads/receipt-confirm-desktop.png)
- [Myanmar Excel confirmation on mobile](../../.qa-tools/delete-uploads/import-confirm-my-mobile.png)
- [Older receipt deletion action on desktop](../../.qa-tools/delete-uploads/old-receipt-delete-desktop.png)
- [Older receipt deletion action on mobile](../../.qa-tools/delete-uploads/old-receipt-delete-mobile.png)
- [Deletion behavior and API details](../runbooks/delete-uploads.md)
