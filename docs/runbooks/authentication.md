# Authentication and staff access

Payment Desk uses its existing NestJS password authentication. The browser keeps only its access token in memory; its refresh credential is a host-only, HttpOnly, SameSite=Strict cookie scoped to /api/v1/auth. Production cookies require HTTPS. Sessions expire no later than 30 days after login, even after refresh.

Each account has one active session. A new login replaces the previous device. Tabs in the same browser share the cookie and coordinate authentication through Web Locks and BroadcastChannel. Logout, password changes/resets, deactivation, and role changes revoke issued access tokens as well as refresh credentials. Network failures show retryable errors; permission-denied responses do not sign users out.

## Configuration and migration

- Set APP_ORIGINS to a comma-separated list of exact browser origins, without trailing slashes. Production requires HTTPS origins, for example https://desk.example.com. Local defaults allow localhost and 127.0.0.1 on ports 3000 and 3001.
- Leave TRUST_PROXY unset for direct connections. Behind a reverse proxy, set only its trusted IP addresses/CIDRs so login limits use the actual client address. Do not trust arbitrary forwarding headers.
- Preserve the existing distinct JWT_SECRET and JWT_REFRESH_SECRET values.
- Generate Prisma, deploy migrations, build both applications, then restart the backend. The auth migration adds sessions, persistent throttle counters, and password-change flags. Existing account credentials and roles are preserved. Previously issued tokens require a fresh login.
- Bootstrap seeding remains create-only: it never resets an existing account password.

## Account operations

Public registration is available from **Create account** on the sign-in screen. It accepts a display name, email or international phone number, and a password with at least 12 characters and no more than 72 UTF-8 bytes. Registration signs the user in immediately with Operator permissions; clients cannot request Admin or Reviewer permissions. Email ownership is not verified by password registration. Email identifiers are case insensitive, and the migration enforces that uniqueness in PostgreSQL.

### Google sign-in

Use a Google Cloud **Web application** OAuth client. Set these values only in `backend/.env` (or server environment variables):

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/browser/google/callback
```

Add that exact redirect URI under the client's **Authorized redirect URIs** in [Google Cloud Console](https://console.cloud.google.com/auth/clients). Configure the consent screen and test users if the client is in testing mode. Restart the backend after changing configuration. For Next development on port 3001, use `http://localhost:3001/api/v1/auth/browser/google/callback` instead and open the app on that origin; its API proxy handles the callback. Production requires HTTPS and the callback origin must appear in `APP_ORIGINS`. Docker Compose forwards the same three variables to the API container.

The Google button is disabled with an explanation until all three settings are present. Password registration and sign-in remain available. Never put the client secret in frontend variables, screenshots, source control, or chat.

Google signs up new users as Operators. For an existing password account with the same email, first sign in with the password, then select **Connect Google** in the workspace header and choose that same Google email. Connecting preserves the account's existing role. The backend refuses automatic email-based linking because password registration alone does not verify email ownership. Google accounts without a password hide the password-change control; an Admin can provision a password through the existing staff reset flow.

The authorization-code flow uses PKCE, a ten-minute signed HttpOnly SameSite=Lax state cookie, and a nonce. The official Google library verifies the ID token signature, issuer, audience and expiry; the app additionally requires a verified email and matching nonce. Google identities are keyed by immutable `sub`, rather than email. Provider tokens are discarded after sign-in. Successful Google sign-in issues the existing browser session and replaces earlier sessions. Failed/cancelled callbacks preserve existing application sessions. See [Google's OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

Admins open Staff to create an account, edit its display name/role/status, or reset its password. Lists use server pagination with 50 accounts per page. Account identifiers cannot be changed through this interface.

Creation and reset show a cryptographically generated temporary password once. Share it privately; it is not retrievable from the list or audit log. It expires after 24 hours. Staff must change it before opening the workspace. New passwords need at least 12 characters and at most 72 UTF-8 bytes; whitespace is preserved. Password changes require the current password and end the session, after which the user signs in again.

Admins cannot deactivate or demote themselves, or use staff reset on their own account. Use Change password for your own credentials. Privilege changes are serialized so concurrent changes cannot remove the last active Admin.

| Capability | Admin | Operator | Reviewer |
| --- | --- | --- | --- |
| Read dashboard, receipts, imports, transactions | Yes | Yes | Yes |
| Recheck existing receipts | Yes | Yes | Yes |
| Upload, import, run batches | Yes | Yes | No |
| Delete receipt and Excel uploads | Yes | Yes | No |
| Resolve legacy manual reviews | Yes | No | Yes |
| Manage business wallets and staff | Yes | No | No |

Manual review and wallet configuration retain their existing API interfaces; this change adds the Staff interface and password management.

## API contracts

Existing token clients retain POST /api/v1/auth/login and POST /api/v1/auth/refresh, which return accessToken, refreshToken, and user. Refresh tokens rotate once per successful refresh. Access/refresh tokens contain a session ID and require a live session.

`POST /api/v1/auth/register` accepts `displayName`, `emailOrPhone`, and `password`, returning the same token-client contract. `POST /api/v1/auth/browser/register` accepts the same fields, requires an allowed Origin, and returns only accessToken/user plus the HttpOnly refresh cookie. `GET /api/v1/auth/options` reports `{ google: boolean }` without exposing credentials. Browser clients POST to `/api/v1/auth/browser/google/start` for the authorization URL; `/google/link` requires an active unrestricted browser access token. Google returns to GET `/api/v1/auth/browser/google/callback`, which sets the browser session and redirects to the app without tokens in the URL. Registration and Google start/link attempts each have a separate 20-attempt/IP/15-minute database limit.

Browser clients use POST /api/v1/auth/browser/login, /refresh and /logout. These requests require an allowed Origin. Login/refresh set the refresh cookie and return only accessToken and user. The browser sends no refresh token in JSON. Browser logout works even when the access token has expired.

GET /api/v1/auth/me returns the current identity, including displayName and mustChangePassword. POST /api/v1/auth/change-password accepts currentPassword and newPassword. A temporary-password account may only use identity, password change, refresh, and logout endpoints.

Admin endpoints:

- GET /api/v1/users?page=1 returns items, total, page, and pageSize.
- POST /api/v1/users accepts displayName, emailOrPhone, and role; returns user, temporaryPassword, and expiresAt once.
- PATCH /api/v1/users/:id accepts displayName, role, and/or status.
- POST /api/v1/users/:id/reset-password returns user, temporaryPassword, and expiresAt once.

An absent, expired, or revoked session returns 401. Insufficient permissions return 403. A restricted temporary-password session returns 403 with code PASSWORD_CHANGE_REQUIRED. Invalid input returns 400, and duplicate account identifiers or last-Admin conflicts return 409.

Failed login attempts are limited to 20 per IP per 15-minute database window; successful logins do not consume the allowance. Refresh has a separate 120-attempt allowance. Counters survive backend restarts and apply across processes.

## Verification

Run backend unit tests and frontend tests/lint/type checks, then build both applications. The HTTP integration suite requires TEST_DATABASE_URL and creates/drops only its uniquely named schemas. AUTH_BROWSER_TEST=1 adds real browser authentication/staff journeys; MVP_BROWSER_TEST=1 retains the existing receipt/import browser flow. A local installed Chrome can be selected through CHROME_EXECUTABLE. OCR in the MVP integration suite uses an injected adapter.

The authentication browser tests cover reload, browser restart, multiple tabs, transient restoration failure, replacement-device login, staff creation/reset, forced password change, role-specific controls, pagination, mobile overflow, and logout. No provider credentials or production deployment are required.
