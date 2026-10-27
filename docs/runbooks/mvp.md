# KBZPay review MVP

This version supports one complete operator workflow: sign in → import KBZPay Excel history → upload a receipt or collect it through Telegram → OCR or manually enter receipt details → compare incoming history → approve, reject or mark a duplicate.

**Every receipt requires human approval.** Matching results are suggestions, never automatic payment approval. No bank credentials or live wallet connection are required. The export supplied by the operator is the source of truth; a screenshot alone does not prove money arrived.

## Local start

Requirements: Node.js 24, pnpm 11, and PostgreSQL 16. Docker is optional if PostgreSQL is already installed.

```bash
# From the repository root: starts PostgreSQL and optional MinIO.
docker compose up -d postgres
cd backend
pnpm install --frozen-lockfile
pnpm setup:local
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm db:seed
pnpm build
pnpm start
```

Open http://localhost:3000. Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the private `backend/.env` file created by `setup:local`. It generates random secrets and a random initial password. Keep `.env` private. `db:seed` creates an account only if it does not exist; it never resets an existing password. If PostgreSQL runs elsewhere, edit `DATABASE_URL` before migrating.

Local object storage works without MinIO or cloud credentials. Its default directory is `backend/data/objects`, outside Git. The UI and API share the same origin. Tokens stay in browser memory, and reloading the page requires signing in again.

## Daily workflow

1. Set the business date (Myanmar time).
2. Import that date's official KBZPay `.xlsx` history. Expected columns: `Transaction Date & Time`, `TM Ref No`, `Detailed Description`, `Credit`, `Debit`, `Balance`, and optional `Notes`. Dates use `DD-MM-YYYY HH:mm:ss`. Incoming transfers have positive credit and zero debit; outgoing exports use negative debit. Rows for another date are reported as row errors, not silently reassigned.
3. Check imported counts and row errors in Import history. Duplicate files are idempotent; overlapping transactions are skipped. Conflicting history is rejected without committing partial transaction data.
4. Upload a PNG, JPEG or WebP receipt. Choose **Read with OCR** if Google Vision is configured, or enter the amount, transaction ID, date and time as shown in the image. Missing or uncertain fields require correction by the operator.
5. Choose **Find match**. A matching transaction ID and amount yields an exact-ID suggestion. If no ID is supplied, a unique amount/time match within ±2 minutes may be suggested. A conflicting supplied ID never falls back to amount/time. Time matching uses Myanmar UTC+06:30.
6. Compare the actual receipt with the incoming transaction, including the receiver and wallet ownership. A suggestion is not proof of receipt. Select the transaction, confirm the comparison, and approve. Selecting a different transaction requires a review note.
7. A transaction can be reserved for only one screenshot, including simultaneous approvals. A previously used payment can be marked as a duplicate. Approved, duplicate and rejected receipts are terminal and cannot be processed again.

The import and review lists are paginated. Receipt status filters apply across all pages. Review audit records include actor, action, receipt, selected transaction and timestamp.

## Optional integrations

- **Google Vision:** set `GOOGLE_VISION_API_KEY`. Without a key, or after a failed OCR request, the receipt remains available for manual entry. KBZPay extraction is a conservative English-label baseline, with Myanmar digit normalization. It needs validation against representative real screenshots; synthetic tests are not evidence of live OCR accuracy.
- **Telegram:** set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`. Register **`https://your-api-domain/api/v1/telegram/webhook`** over HTTPS. The bot accepts photos, not arbitrary documents. New Telegram receipts appear under their Myanmar received date until their actual receipt date is entered. An authenticated operator runs OCR from the review screen. There is no unattended queue in this MVP.
- **Private S3/R2:** set `STORAGE_DRIVER=s3` plus endpoint, bucket and credentials from `.env.example`. Provision the private bucket first. Objects are returned only through authenticated endpoints. The default local storage requires a persistent, backed-up volume.

## Tests

```bash
cd backend
pnpm prisma:validate
pnpm build
pnpm test
# Use a dedicated PostgreSQL test database with schema create/drop permission.
TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/payment_verification_test?schema=public' pnpm test:e2e
```

The HTTP integration suite creates and drops its own uniquely named schema and private temporary storage directory. It tests imports, conflicting data, file validation, provider external IDs, OCR through an injected test adapter, manual correction, approval confirmation, permissions, concurrent approvals, terminal states, audit records and refresh-token rotation. It does not call live Google Vision or Telegram.

For optional browser verification, install Playwright and Chromium in the development environment, then run with `MVP_BROWSER_TEST=1`. `scripts/browser-smoke.cjs` drives the real UI against the test API. `test/fixtures/kbzpay-synthetic.png` is explicitly synthetic and must never be treated as payment evidence.

## Deployment

`docker-compose.mvp.yml` builds the backend and UI, applies committed migrations, creates the initial administrator, and uses persistent database and object volumes. Supply the environment values referenced in that file, then:

```bash
docker compose -f docker-compose.mvp.yml up --build -d
```

Use URL-safe characters for `POSTGRES_PASSWORD` because it is interpolated into `DATABASE_URL`. The service binds to localhost:3000. Put it behind an HTTPS reverse proxy; do not publish database or object-storage ports. Back up both PostgreSQL and objects. Remove `ADMIN_PASSWORD` from steady-state deployment configuration after initial provisioning if using a separate one-off seed job.

For an existing database created with `prisma db push`, back it up and compare its schema to the baseline before marking `202610270001_baseline` as applied using `prisma migrate resolve --applied`. Never resolve a migration against a schema that does not match it. The second migration makes Telegram fields nullable and adds the one-screenshot-per-used-payment constraint. Existing conflicting reservation records must be reconciled before applying that constraint.

## Current boundaries

Included: KBZPay import and receipt review, private image access, role checks, review audit trail, manual date-scoped OCR runs of up to 20 receipts, and a responsive Web Admin.

Deferred: AYA/Wave history import, Flutter client, bank APIs, automatic approval, durable OCR retry queues/schedulers, customer notifications, report export and multi-business tenancy. The MVP is a single-business workspace. Keep deployment to a small trusted operator team; login rate limiting is per process and should be complemented by the HTTPS proxy when running multiple replicas.
