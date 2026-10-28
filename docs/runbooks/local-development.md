# Local Development Runbook

## Prerequisites

Use Node.js 24 or later, pnpm 11 or later, Docker, and a PostgreSQL-compatible development environment. Provider exports and screenshots should remain outside the repository unless they are sanitized test fixtures.

## Start dependencies

```bash
docker compose up -d postgres minio
```

Copy `backend/.env.example` to `backend/.env` and adjust values only for the local environment.

## Prepare Prisma

```bash
cd backend
pnpm install
pnpm prisma:generate
pnpm prisma:validate
pnpm prisma:migrate:dev --name init
```

## Build the frontend

From the repository root:

```bash
npm --prefix frontend ci
npm --prefix frontend run build
```

NestJS serves the generated export on port 3000. For optional hot reload, keep NestJS running on port 3000 and run `npm --prefix frontend run dev`; open port 3001. The development-only Next.js proxy forwards `/api/v1` to NestJS. Development uses `.next-dev` so it cannot collide with production `.next` output. Production continues to use static files and one NestJS server.

## Run the backend

```bash
cd backend
pnpm start:dev
```

The health endpoint is `GET /api/v1/health`. Authentication endpoints are `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `GET /api/v1/auth/me`, and `POST /api/v1/auth/logout`. The protected import contract is `POST /api/v1/imports` as multipart form-data with `provider`, `businessDate`, and `file`. The manual/scheduled batch contract is `POST /api/v1/verification/batches`.

Browser sessions, staff management, role permissions, migration behavior, and origin/proxy configuration are documented in [authentication.md](authentication.md).

## Run tests

```bash
cd backend
pnpm test
```

The current unit tests cover provider isolation, exact transaction-ID matching, Level 2 tolerance-window matching, ambiguous candidates, and out-of-window candidates.

## Operational rules

Every verification run must include an explicit provider scope and business date/date range. A manual run may be started during the day or at night. A scheduled run uses the same batch lifecycle and differs by trigger metadata. Concurrent active batches for the same scope must be rejected or made idempotent.

Do not enable provider-specific auto-verification until actual export and screenshot samples have been converted into parser/OCR fixtures and the Level 2 tolerance policy has been approved. Configure each business wallet identity before relying on direction classification. Ambiguous matches, unknown direction, and outgoing payments should remain in review-only mode by default.
