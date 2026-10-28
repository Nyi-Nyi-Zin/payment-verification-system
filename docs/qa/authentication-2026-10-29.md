# Authentication verification — 2026-10-29

Implemented database-backed authentication sessions, immediate revocation, fixed 30-day browser login, one active device per account, Admin staff management, and required temporary-password changes. Existing role permissions and token-client endpoints remain supported.

## Results

| Check | Result |
| --- | --- |
| Backend unit tests | 60 passed across 13 suites |
| Frontend unit tests | 21 passed |
| Authentication HTTP and real-browser integration | 13 passed, including the parent test |
| Existing payment/import HTTP and real-browser integration | 19 passed, including the parent test |
| Frontend UI browser regression | Passed: two locales, three viewports, sequential uploads, session expiry, logout, Reviewer restrictions, and existing receipt/import interactions |
| Frontend TypeScript and ESLint | Passed |
| Backend and static frontend production builds | Passed |
| Prisma schema validation and client generation | Passed |
| Local authentication migration | Applied |
| Existing local account credentials, roles, and statuses | Compared before/after migration and unchanged |
| Restarted localhost:3000 | Health and page 200; anonymous Staff and browser refresh 401 |

The authentication HTTP/browser suite uses its own temporary PostgreSQL schema. It covers token expiry, refresh replay/concurrency, concurrent replacement logins, immediate logout revocation, allowed origins, cookie attributes, role restrictions through direct API requests, staff provisioning, password policy, temporary-password expiry, required password change, account deactivation/reactivation, password reset, concurrent Admin privilege changes, and separate persistent login/refresh limits.

Real Chrome verification includes reload, a persistent browser profile closed and reopened, concurrent tabs, cross-tab logout/login, network recovery during session restoration, a separate-device login, Staff creation/reset, forced password change, Reviewer controls, server pagination, and desktop/mobile layouts. The existing payment/import integration suite uses an injected OCR adapter.

## Review artifacts

- [Staff desktop](../../.qa-tools/authentication/staff-desktop.png)
- [Staff mobile](../../.qa-tools/authentication/staff-mobile.png)
- [Restored browser session](../../.qa-tools/authentication/restored-session.png)
- [Configuration, API contracts, and account operations](../runbooks/authentication.md)

Evidence is local. No production deployment or external identity/email provider was used.
