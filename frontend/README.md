# Payment Desk frontend

Next.js 16 / React 19, strict TypeScript, Tailwind CSS v4, TanStack React Query, Zod, React Hook Form and its Zod resolver. The light blue Myanmar/English workspace uses the existing NestJS API; no database, OCR or matching rules live in the frontend.

## Build and run

Use Node.js 24. From the repository root, after configuring the backend and its PostgreSQL database as described in [the MVP runbook](../docs/runbooks/mvp.md):

```sh
npm --prefix frontend ci
npm run build
npm start
```

Open **http://localhost:3000**. The root build exports Next.js, publishes its static assets and CSP hashes into ignored `backend/frontend-dist/`, then builds NestJS. Restart NestJS after rebuilding because it loads CSP hashes at startup. No `next start` server is used in production. The backend Dockerfile builds both applications from the repository root; use `docker compose -f docker-compose.mvp.yml up --build -d`.

For hot reload, run the backend on port 3000 and `npm --prefix frontend run dev` on port 3001. Its development-only proxy forwards API requests to port 3000. `.next-dev` and production `.next` are separate. Build the production export before verifying the deployed serving/CSP behavior.

## Structure and state

- `src/components/`: login, shared workspace, receipt results, import form, history and accessible native dialogs. All workspace views share one page so navigation preserves active receipt work.
- `src/lib/`: API/session client, strict domain types, shared Zod schemas, bilingual messages, Myanmar date formatting and the sequential queue.
- React Query holds server records under session/date/filter/page/search keys. Mutations invalidate the affected session; session expiry/logout cancels requests and clears private cached data. Upload and process mutations never retry automatically.
- The queue holds files only in page memory, validates picker/drop input identically and processes one request at a time. Pause finishes the active receipt. Retry uses a known screenshot ID; a network failure before that ID retains the file for an idempotent upload retry. Terminal matches/duplicates cannot be reprocessed.
- Tokens stay in memory. Only language preference is persisted. Reloading requires signing in and selecting unsent files again. Completed receipts remain in server history. UI role checks supplement backend authorization.
- Fonts and icons are local, with their licenses. Tailwind design tokens and shared components keep the responsive screens consistent. This export does not use Server Actions, dynamic request-time rendering or Next.js image optimization.

## Verification

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
npm run build
# Download Chromium once, from frontend/:
npx playwright install chromium
# From the root:
npm --prefix frontend run test:browser
npm --prefix backend test
```

Browser tests can use an installed Chrome via `CHROME_EXECUTABLE`. `PLAYWRIGHT_MODULE` optionally overrides the locked frontend Playwright package. Synthetic screenshots are written under ignored `.qa-tools/next-ui/`.

For real NestJS/PostgreSQL browser integration, set `TEST_DATABASE_URL` to a development/test database with schema create/drop permission and `MVP_BROWSER_TEST=1`, then run `npm --prefix backend run test:e2e`. The existing harness creates/drops only its unique disposable schema and temporary objects. Its OCR adapter is synthetic; these tests do not establish live OCR accuracy, bank confirmation, physical-device behavior or production deployment.
