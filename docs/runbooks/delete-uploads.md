# Delete uploaded receipts and Excel files

Admins and Operators can select **Delete** beside a processed receipt in either the current upload set or saved receipts, and beside an Excel file in **Excel imports**. Reviewers cannot delete uploads. A confirmation dialog describes the effect; Cancel leaves the upload unchanged. Processing uploads cannot be deleted until checking finishes.

Saved receipts open across **All dates** by default, including uploads from earlier days. **Manage uploaded receipts** at the top of the page jumps to this list and clears any receipt date/status filter. Select a receipt to use **Delete receipt** in the details header, or use its row's Delete button. The optional receipt date filter is independent from the wallet-history date; **All dates** clears it again.

Receipt deletion removes its saved image, OCR results, verification results and its used-payment claim. It also removes every row in the current upload set that points to that same receipt and clears its cached detail/preview. The payment becomes available for another receipt check. Claims belonging to other saved receipts remain protected. Shared image objects are removed only after their last receipt reference is removed.

Receipts previously marked Duplicate offer **Check again** in both the current upload set and saved receipts. Reuploading an existing Duplicate image also reruns comparison. If the original matched receipt still exists, the result remains Duplicate; after it is deleted, one matching receipt can claim the payment. Rechecking a matched receipt remains blocked.

Excel deletion removes the original file, import/error rows and transactions which are neither used nor referenced by receipt checks. Used/referenced transactions remain in wallet history, with their original source upload detached. Reimporting the same Excel is allowed; retained transactions still participate in deduplication and used-payment protection.

The API retains an audit entry recording the actor and upload identifier. Batch totals are updated after receipt deletion. Delete requests are idempotent; repeating a successful request returns `deleted: false`. Storage failures are reported and database changes roll back so the user can retry. Application deletion targets the active local/S3 object; provider backups, bucket versions and retention policies are outside this endpoint.

## API and deployment

- `DELETE /api/v1/screenshots/:id`: authenticated Admin or Operator. Returns `{ success: true, deleted: boolean }`.
- `DELETE /api/v1/imports/:id`: authenticated Admin or Operator. Returns `success`, `deleted`, `deletedTransactions` and `retainedTransactions`.
- In-flight processing returns HTTP 409 with code `UPLOAD_BUSY`; invalid UUIDs return 400. Anonymous users receive 401 and Reviewers receive 403.
- Generate Prisma, apply migrations through `202610290004_release_deleted_receipt_claims`, build both applications, then restart the backend. The latest migration removes claims left by previously deleted receipts and requires every remaining claim to belong to a saved receipt, with cascade deletion. It preserves all claims for existing receipts. Existing Duplicate results must be checked again to refresh their status.
- Local storage deletes only the validated file below `STORAGE_LOCAL_DIR`. S3/R2 storage needs `s3:DeleteObject` in addition to its existing object permissions.
