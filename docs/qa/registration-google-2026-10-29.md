# Registration and Google sign-in — 2026-10-29

Password registration creates an Operator account and immediately establishes the existing browser/API session. Google OAuth creates Operators or signs in an already linked Google identity. Existing password accounts require authenticated, matching-email Google linking. Existing Admin authorization is preserved.

## Local evidence

- Backend: 63 unit tests across 14 suites passed, including Google configuration, signed state, expiry/tampering, PKCE, token-verifier audience, nonce, and verified-email checks.
- Frontend: 22 tests passed; TypeScript, ESLint, and production export passed.
- Auth HTTP/browser integration: 15 tests passed against a uniquely named PostgreSQL test schema. This covers public registration, duplicate/case-insensitive identifiers, password byte limits, role injection rejection, browser Origin checks, HttpOnly cookies, refresh, Google callback failures/cancellation, immutable Google identity reuse, account deactivation, explicit linking, revoked link sessions, and existing session/staff regressions.
- Real Chrome covered registration validation, Myanmar/English at 390px and 1440px, immediate sign-in, Operator controls, reload/logout, and a simulated Google authorization return through the real app/API/database session flow. Google login also restored the same identity in another open tab. Existing browser restart, multi-tab, staff reset, required password change and pagination journeys passed.
- Prisma client generation and schema validation passed. Additive migration `202610290002_registration_google` was applied to the configured local database.
- Restarted local app: `/`, `/api/v1/health`, and `/api/v1/auth/options` returned 200. Options correctly reported `google: false` because local Google OAuth credentials are absent.
- Chrome against the actual restarted `localhost:3000` confirmed registration is visible, the Google button is disabled without credentials, and no runtime/CSP errors occurred.

The Google provider token exchange/signature-verifier responses are mocked in tests; no real Google consent/login or production deployment was verified. The official library performs live ID-token verification when configured. An execution-environment pause caused one run to exceed its parent timeout; a subsequent complete run passed.

## Artifacts

- [Myanmar registration on mobile](../../.qa-tools/authentication/register-my-390.png)
- [English registration on desktop](../../.qa-tools/authentication/register-en-1440.png)
- [Actual local app without Google credentials](../../.qa-tools/authentication/register-local-unconfigured.png)
- [Configuration and Google Cloud callback setup](../runbooks/authentication.md#google-sign-in)
