# KBZPay automatic comparison

The Web Admin workflow is: sign in → import a complete KBZPay Excel statement → upload a receipt → receive an automatic Match, Duplicate or No match result. Uploading a receipt runs OCR and comparison in the request; no approval checkbox or manual transaction selection is required.

Local Tesseract OCR is the default. Download its English/Myanmar models once with `pnpm setup:ocr`; recognition then runs on the backend machine without a cloud API or billing account. Unavailable OCR, failed OCR and missing amount/date are reported separately from No match. A Match records agreement with imported incoming history and reserves that transaction for one receipt. It does not call a bank API or establish image authenticity. Legacy manual review endpoints remain for compatibility but are not part of the current Web Admin flow.

## Local start

Requirements: Node.js 24, pnpm 11, and PostgreSQL 16. Docker is optional if PostgreSQL is already installed.

```bash
# From the repository root: starts PostgreSQL and optional MinIO.
docker compose up -d postgres
cd backend
pnpm install --frozen-lockfile
pnpm setup:local
pnpm setup:ocr
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm db:seed
# Build the Next.js static frontend before serving NestJS.
cd ..
npm --prefix frontend ci
npm run build
npm start
```

Open http://localhost:3000. Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the private `backend/.env` file created by `setup:local`. It generates random secrets and a random initial password. Keep `.env` private. `db:seed` creates an account only if it does not exist; it never resets an existing password. If PostgreSQL runs elsewhere, edit `DATABASE_URL` before migrating.

Local object storage works without MinIO or cloud credentials. Its default directory is `backend/data/objects`, outside Git. The Next.js static export in `backend/frontend-dist/` and API share the same NestJS origin. Frontend source lives in `frontend/`; run the root `npm run build` after UI changes. The export includes a CSP hash manifest for hydration scripts, loaded when NestJS starts. Tokens stay in browser memory, and reloading the page requires signing in again.

`OCR_DRIVER=tesseract` selects local recognition even if an old Google key remains in `.env`. `TESSERACT_DATA_DIR` defaults to `./data/tessdata`; `OCR_LOCAL_TIMEOUT_MS` defaults to 60000. Setup downloads pinned, SHA-256-verified public `tessdata_best` models (revision `e12c65a915945e4c28e237a9b52bc4a8f39a0cec`). Run `pnpm setup:ocr` again to replace existing fast models, then restart the backend so its reusable worker loads the new models. Best models favor recognition quality over speed and can use more CPU time and memory; measure accuracy on representative receipts. Runtime reads these local files and the bundled Tesseract.js/WASM core; it never downloads models or falls back to a cloud service. One reusable worker processes receipts serially, with up to eight active/waiting jobs per process and worker reset on timeout/failure. The dashboard reports model availability. Missing models produce `OCR_LOCAL_MODELS_MISSING`; run setup and choose **Check again** after restarting the server. Local recognition uses CPU and memory on the host; model accuracy still depends on receipt quality.

## Daily workflow

1. Import an official KBZPay `.xlsx` statement. The Web Admin sends `scope=statement` and preserves each row's actual Myanmar transaction date, regardless of the current View date. API clients may use `scope=day` (the compatibility default) to restrict parsing to `businessDate`. Expected columns: `Transaction Date & Time`, `TM Ref No`, `Detailed Description`, `Credit`, `Debit`, `Balance`, and optional `Notes`. Dates use `DD-MM-YYYY HH:mm:ss`. Incoming credit is positive; outgoing debit is negative. Known opening-balance/footer rows are skipped.
2. Check imported counts and row errors. Duplicate files are idempotent, overlapping transactions are skipped, and conflicts cancel the entire transaction. Outgoing rows explicitly labelled `QuickPay Fee Charge` are excluded from payment matching: KBZPay uses the principal payment's reference for its separate service fee. The principal payment remains at its own amount; unrelated conflicting payments still cancel the import. Reuploading a previously day-scoped statement in full-statement mode imports the missing days and replaces its old date-filter errors without deleting existing payments.
3. On **Check receipts**, choose or drop one or several PNG/JPEG/WebP images (up to 10 MB each), then choose **Check receipts**. They are sent and checked one at a time. Pause finishes the current receipt; Resume continues with remaining images. Results for different receipt dates stay together in the current upload set. The history date selector only filters saved receipts and wallet history.
4. **Match:** the transaction ID and amount agree with an incoming transaction on the receipt date. If no ID was read, a unique amount/time match within ±2 minutes is allowed and explicitly described. Conflicting supplied IDs never fall back to amount/time. Ambiguous candidates remain unmatched with a Cannot determine explanation. Time matching uses Myanmar UTC+06:30.
5. **Duplicate:** another receipt already reserved the same Excel payment. Unique database constraints ensure simultaneous uploads produce one Match and one Duplicate. Uploading identical image bytes returns the existing receipt with a separate Duplicate file notification and avoids another OCR call.
6. **No match:** no eligible incoming transaction agrees with the read fields. The result displays a red error explaining that the receipt transaction was not found in Excel, or that its amount differs. Import missing history and choose **Check again**. **Cannot read:** configure OCR or supply a clearer image, then retry. Amount and receipt date are required; missing fields never produce a match. Agreement between a receipt and an Excel row is a successful Match; Duplicate only means a repeated receipt image or a second receipt claiming the same payment. Distinct transaction IDs may have identical amounts and still match independently.
7. Matched, duplicate and rejected receipts are terminal. The result detail explains the outcome before the image and compared fields; there are no manual approval controls. Myanmar/English can be changed without losing the queue. Keep the page open until the queue finishes; closing/reloading does not continue unsent work. Completed receipts remain in saved history. Excel imports lists all statement uploads. See [UI workflow and verification](../qa/payment-desk-ui.md).

The import and review lists are paginated. Receipt status filters apply across all pages. Review audit records include actor, action, receipt, selected transaction and timestamp.

## Optional integrations

- **Google Vision (optional, explicit opt-in):** only used with `OCR_DRIVER=google-vision` and `GOOGLE_VISION_API_KEY`. It requires a configured Cloud Vision API and billing on the key's project, as described in [Google's setup guide](https://docs.cloud.google.com/vision/docs/setup). Local Tesseract does not need these settings. Google errors distinguish billing, API/key/permission, quota/network/timeout and unreadable-image failures. Raw provider errors and API keys are not stored or exposed.
- **Myanmar E-Receipts:** local recognition loads `eng+mya`. The extractor supports the Myanmar transaction-reference label, one isolated 20-digit reference when its label is unreadable, Myanmar digits and payer-side signed amounts such as `-1.00 Ks` (compared by magnitude with incoming history). Validate OCR with representative real screenshots; synthetic adapter tests do not prove image-reading accuracy. Tesseract.js [local model configuration](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) documents offline language paths.
- **Best model compatibility:** the bundled custom Node OCR worker avoids Tesseract.js 7's broken relaxed-SIMD float-model path while retaining ordinary SIMD detection. Keep the emitted `dist/ocr/tesseract.worker.js` with the backend build; see [the local best-model verification](../qa/ocr-best-2026-10-29.md) and [upstream issue 1080](https://github.com/naptha/tesseract.js/issues/1080).
- **Telegram:** set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`. Register **`https://your-api-domain/api/v1/telegram/webhook`** over HTTPS. The bot accepts photos, not arbitrary documents. New Telegram receipts appear under their Myanmar received date until their actual receipt date is entered. An authenticated operator runs OCR from the review screen. There is no unattended queue in this MVP.
- **Private S3/R2:** set `STORAGE_DRIVER=s3` plus endpoint, bucket and credentials from `.env.example`. Provision the private bucket first. Objects are returned only through authenticated endpoints. The default local storage requires a persistent, backed-up volume.

## Tests

```bash
cd backend
pnpm prisma:validate
# From the root, first run: npm --prefix frontend ci && npm run build
pnpm build
pnpm test
# Use a dedicated PostgreSQL test database with schema create/drop permission.
TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/payment_verification_test?schema=public' pnpm test:e2e
```

The HTTP integration suite creates and drops its own uniquely named schema and private temporary storage directory. It tests full-statement import upgrades, real transaction dates, conflicting imports, image validation/private access, OCR through an injected adapter, automatic match/no-match, file/payment duplicates, concurrent uploads, unavailable/failed OCR, retry, permissions, terminal states, audit records and refresh-token rotation. It does not call live Google Vision or Telegram.

For browser verification, install the frontend dependencies and run `npx playwright install chromium` in `frontend/` (or set `CHROME_EXECUTABLE` to a local Chrome executable). Build the frontend first, then run with `MVP_BROWSER_TEST=1`. `scripts/browser-smoke.cjs` drives the real UI against the test API. `test/fixtures/kbzpay-synthetic.png` is explicitly synthetic and must never be treated as payment evidence.

## Deployment

`docker-compose.mvp.yml` builds the backend and UI, applies committed migrations, creates the initial administrator, and uses persistent database and object volumes. The image downloads/verifies OCR models during its build and stores them in `/app/ocr-models`, outside the object-data volume. Runtime OCR stays local. Supply the environment values referenced in that file, then:

```bash
docker compose -f docker-compose.mvp.yml up --build -d
```

Use URL-safe characters for `POSTGRES_PASSWORD` because it is interpolated into `DATABASE_URL`. The service binds to localhost:3000. Put it behind an HTTPS reverse proxy; do not publish database or object-storage ports. Back up both PostgreSQL and objects. Remove `ADMIN_PASSWORD` from steady-state deployment configuration after initial provisioning if using a separate one-off seed job.

For an existing database created with `prisma db push`, back it up and compare its schema to the baseline before marking `202610270001_baseline` as applied using `prisma migrate resolve --applied`. Never resolve a migration against a schema that does not match it. The second migration makes Telegram fields nullable and adds the one-screenshot-per-used-payment constraint. Existing conflicting reservation records must be reconciled before applying that constraint.

## Current boundaries

Included: KBZPay full-statement import, automatic Web receipt comparison, file/payment duplicate detection, private image access, role checks, audit trail, date-scoped retry runs of up to 20 receipts, and a responsive Web Admin. No schema migration is required for the automatic-comparison update; existing status enums are reused, with VERIFIED displayed as Match.

Deferred: AYA/Wave history import, Flutter client, bank APIs, durable OCR retry queues/schedulers, customer notifications, report export and multi-business tenancy. Telegram collection is separate from Web upload automation and still requires a date-scoped OCR run or Check again. The MVP is a single-business workspace. Login rate limiting is per process and should be complemented by the HTTPS proxy when running multiple replicas.
