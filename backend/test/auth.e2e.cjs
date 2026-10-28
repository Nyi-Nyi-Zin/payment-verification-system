const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { createServer } = require("node:net");
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
const database = process.env.TEST_DATABASE_URL;

test(
  "HTTP authentication, session revocation and staff authorization",
  { skip: !database, timeout: 240000 },
  async (t) => {
    const schema = "auth_test_" + randomUUID().replaceAll("-", "");
    const url = new URL(database);
    url.searchParams.set("schema", schema);
    const reservation = createServer();
    await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const base = "http://127.0.0.1:" + port;
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_URL: url.toString(),
      JWT_SECRET: "auth-test-access-".repeat(4),
      JWT_REFRESH_SECRET: "auth-test-refresh-".repeat(4),
      APP_ORIGINS: base,
      GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "synthetic-google-secret",
      GOOGLE_REDIRECT_URI: base + "/api/v1/auth/browser/google/callback",
    });
    const root = new PrismaClient({ datasources: { db: { url: database } } });
    let app, prisma;
    try {
      const migrated = spawnSync(
        process.execPath,
        [
          resolve(__dirname, "../node_modules/prisma/build/index.js"),
          "migrate",
          "deploy",
        ],
        { cwd: resolve(__dirname, ".."), env: process.env, encoding: "utf8" },
      );
      assert.equal(migrated.status, 0, migrated.stderr);
      const { Test } = require("@nestjs/testing");
      const { AppModule } = require("../dist/app.module");
      const { configureApp } = require("../dist/configure-app");
      const { PrismaService } = require("../dist/database.prisma");
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.listen(port, "127.0.0.1");
      prisma = module.get(PrismaService);
      const password = "Test-account-password";
      const accounts = {};
      for (const role of ["ADMIN", "OPERATOR", "REVIEWER"])
        accounts[role] = await prisma.user.create({
          data: {
            role,
            displayName: "Test " + role,
            emailOrPhone: role.toLowerCase() + "@example.test",
            passwordHash: await hash(password, 4),
          },
        });
      const call = async (
        path,
        { token, cookie, origin, method = "GET", body } = {},
      ) => {
        const response = await fetch(base + "/api/v1" + path, {
          method,
          headers: {
            ...(token ? { Authorization: "Bearer " + token } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...(origin ? { Origin: origin } : {}),
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return {
          status: response.status,
          data: await response.json(),
          cookie: response.headers.get("set-cookie"),
        };
      };
      const login = (role, extra = {}) =>
        call("/auth/login", {
          method: "POST",
          body: { emailOrPhone: accounts[role].emailOrPhone, password },
          ...extra,
        });
      let admin;
      await t.test(
        "public registration validates input, prevents privilege escalation and creates browser sessions",
        async () => {
          const values = {
            displayName: "Self Registered",
            emailOrPhone: "REGISTER@example.test",
            password: " Valid-new-password ",
          };
          for (const change of [
            { role: "ADMIN" },
            { displayName: " " },
            { emailOrPhone: "invalid" },
            { password: "က".repeat(25) },
          ]) {
            assert.equal(
              (
                await call("/auth/register", {
                  method: "POST",
                  body: { ...values, ...change },
                })
              ).status,
              400,
            );
          }
          const created = await call("/auth/register", {
            method: "POST",
            body: values,
          });
          assert.equal(created.status, 201);
          assert.equal(created.data.user.role, "OPERATOR");
          assert.equal(created.data.user.emailOrPhone, "register@example.test");
          assert.equal(created.data.user.mustChangePassword, false);
          assert.ok(created.data.refreshToken);
          assert.equal(
            (await call("/users", { token: created.data.accessToken })).status,
            403,
          );
          const saved = await prisma.user.findUnique({
            where: { id: created.data.user.id },
          });
          assert.notEqual(saved.passwordHash, values.password);
          assert.equal(
            (
              await call("/auth/register", {
                method: "POST",
                body: { ...values, emailOrPhone: "register@EXAMPLE.test" },
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await call("/auth/login", {
                method: "POST",
                body: {
                  emailOrPhone: values.emailOrPhone,
                  password: values.password,
                },
              })
            ).status,
            201,
          );
          assert.equal(
            (
              await call("/auth/browser/register", {
                method: "POST",
                body: { ...values, emailOrPhone: "browser@example.test" },
                origin: "https://evil.example",
              })
            ).status,
            403,
          );
          const browser = await call("/auth/browser/register", {
            method: "POST",
            body: { ...values, emailOrPhone: "browser@example.test" },
            origin: base,
          });
          assert.equal(browser.status, 201);
          assert.equal(browser.data.refreshToken, undefined);
          assert.match(browser.cookie, /HttpOnly/);
          assert.equal(
            (
              await call("/auth/browser/refresh", {
                method: "POST",
                origin: base,
                cookie: browser.cookie.split(";")[0],
              })
            ).status,
            201,
          );
        },
      );
      await t.test(
        "Google callback, identity reuse, safe account linking and revoked sessions",
        async () => {
          const google = module.get(
            require("../dist/auth/google-auth").GoogleAuth,
          );
          const original = google.verify;
          // Only the external provider exchange is replaced; HTTP, state, cookies and DB are real.
          let profile = {
            sub: "google-new-user",
            email: "google-new@gmail.com",
            name: "Google User",
          };
          google.verify = async () => profile;
          const begin = async (token) => {
            const r = await call(
              "/auth/browser/google/" + (token ? "link" : "start"),
              { method: "POST", origin: base, token },
            );
            assert.equal(r.status, 201);
            return {
              cookie: r.cookie.split(";")[0],
              state: new URL(r.data.url).searchParams.get("state"),
            };
          };
          const finish = (start, query = {}) =>
            fetch(
              base +
                "/api/v1/auth/browser/google/callback?" +
                new URLSearchParams({
                  state: start.state,
                  code: "synthetic-code",
                  ...query,
                }),
              { headers: { Cookie: start.cookie }, redirect: "manual" },
            );
          try {
            assert.equal((await call("/auth/options")).data.google, true);
            assert.equal(
              (await call("/auth/browser/google/start", { method: "POST" }))
                .status,
              403,
            );
            let start = await begin();
            let callback = await finish(start, { state: "incorrect" });
            assert.equal(callback.headers.get("location"), "/#oauth=failed");
            assert.doesNotMatch(
              callback.headers.get("set-cookie"),
              /paymentdesk_refresh/,
            );
            callback = await finish(await begin(), { error: "access_denied" });
            assert.equal(callback.headers.get("location"), "/#oauth=cancelled");
            callback = await finish(await begin());
            assert.equal(callback.headers.get("location"), "/#oauth=success");
            const refreshCookie = callback.headers
              .get("set-cookie")
              .match(/paymentdesk_refresh=[^;]+/)[0];
            const signed = await call("/auth/browser/refresh", {
              method: "POST",
              cookie: refreshCookie,
              origin: base,
            });
            assert.equal(signed.status, 201);
            assert.equal(signed.data.user.role, "OPERATOR");
            assert.equal(signed.data.user.googleLinked, true);
            assert.equal(signed.data.user.hasPassword, false);
            const id = signed.data.user.id;
            profile.email = "changed-google@gmail.com";
            assert.equal(
              (await finish(await begin())).headers.get("location"),
              "/#oauth=success",
            );
            assert.equal(
              await prisma.user.count({
                where: { googleSubject: profile.sub },
              }),
              1,
            );
            await prisma.user.update({
              where: { id },
              data: { status: "INACTIVE" },
            });
            assert.equal(
              (await finish(await begin())).headers.get("location"),
              "/#oauth=failed",
            );
            profile = {
              sub: "google-existing-admin",
              email: accounts.ADMIN.emailOrPhone,
              name: "Google Admin",
            };
            assert.equal(
              (await finish(await begin())).headers.get("location"),
              "/#oauth=account_exists",
            );
            assert.equal(
              (
                await prisma.user.findUnique({
                  where: { id: accounts.ADMIN.id },
                })
              ).googleSubject,
              null,
            );
            const existing = await call("/auth/browser/login", {
              method: "POST",
              origin: base,
              body: { emailOrPhone: accounts.ADMIN.emailOrPhone, password },
            });
            start = await begin(existing.data.accessToken);
            await login("ADMIN"); // Revoke the login used to initiate linking.
            assert.equal(
              (await finish(start)).headers.get("location"),
              "/#oauth=failed",
            );
            const active = await call("/auth/browser/login", {
              method: "POST",
              origin: base,
              body: { emailOrPhone: accounts.ADMIN.emailOrPhone, password },
            });
            assert.equal(
              (await finish(await begin(active.data.accessToken))).headers.get(
                "location",
              ),
              "/#oauth=success",
            );
            const linked = await prisma.user.findUnique({
              where: { id: accounts.ADMIN.id },
            });
            assert.equal(linked.googleSubject, profile.sub);
            assert.equal(linked.role, "ADMIN");
            assert.equal(
              (await finish(await begin())).headers.get("location"),
              "/#oauth=success",
            );
          } finally {
            google.verify = original;
            await prisma.authRateLimit.deleteMany();
          }
        },
      );
      await t.test(
        "invalid credentials, token types, inactive and legacy sessions",
        async () => {
          assert.equal(
            (
              await login("ADMIN", {
                body: {
                  emailOrPhone: accounts.ADMIN.emailOrPhone,
                  password: "wrong-password",
                },
              })
            ).status,
            401,
          );
          admin = (await login("ADMIN")).data;
          assert.ok(admin.accessToken && admin.refreshToken);
          assert.equal(admin.user.displayName, "Test ADMIN");
          assert.equal(
            (await call("/auth/me", { token: admin.refreshToken })).status,
            401,
          );
          const jwt = module.get(require("@nestjs/jwt").JwtService);
          const legacy = jwt.sign({
            id: accounts.ADMIN.id,
            role: "ADMIN",
            tokenType: "access",
          });
          assert.equal((await call("/auth/me", { token: legacy })).status, 401);
          assert.equal((await call("/users")).status, 401);
        },
      );
      await t.test(
        "refresh rotation is atomic and expiry is fixed",
        async () => {
          const before = await prisma.authSession.findFirst({
            where: { userId: accounts.ADMIN.id, revokedAt: null },
          });
          const results = await Promise.all(
            [1, 2].map(() =>
              call("/auth/refresh", {
                method: "POST",
                body: { refreshToken: admin.refreshToken },
              }),
            ),
          );
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 401]);
          admin = results.find((r) => r.status === 201).data;
          const after = await prisma.authSession.findUnique({
            where: { id: before.id },
          });
          assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
          assert.equal(
            (await call("/auth/me", { token: admin.accessToken })).status,
            200,
          );
        },
      );
      await t.test(
        "new and concurrent logins replace previous access tokens",
        async () => {
          const previous = admin;
          const results = await Promise.all([login("ADMIN"), login("ADMIN")]);
          assert.ok(results.every((r) => r.status === 201));
          const access = await Promise.all(
            results.map((r) => call("/auth/me", { token: r.data.accessToken })),
          );
          assert.deepEqual(access.map((r) => r.status).sort(), [200, 401]);
          assert.equal(
            (await call("/auth/me", { token: previous.accessToken })).status,
            401,
          );
          admin = results[access.findIndex((r) => r.status === 200)].data;
          assert.equal(
            await prisma.authSession.count({
              where: { userId: accounts.ADMIN.id, revokedAt: null },
            }),
            1,
          );
        },
      );
      await t.test(
        "browser cookies, origin checks and logout revoke captured tokens",
        async () => {
          const values = {
            emailOrPhone: accounts.ADMIN.emailOrPhone,
            password,
          };
          for (const origin of [undefined, "https://attacker.example"])
            assert.equal(
              (
                await call("/auth/browser/login", {
                  method: "POST",
                  body: values,
                  origin,
                })
              ).status,
              403,
            );
          const result = await call("/auth/browser/login", {
            method: "POST",
            body: values,
            origin: base,
          });
          assert.equal(result.status, 201);
          assert.equal(result.data.refreshToken, undefined);
          assert.match(result.cookie, /HttpOnly/);
          assert.match(result.cookie, /SameSite=Strict/);
          assert.match(result.cookie, /Path=\/api\/v1\/auth/);
          assert.match(result.cookie, /Expires=/);
          const cookie = result.cookie.split(";")[0];
          assert.equal(
            (
              await call("/auth/browser/refresh", {
                method: "POST",
                cookie,
                origin: "https://attacker.example",
              })
            ).status,
            403,
          );
          const refreshed = await call("/auth/browser/refresh", {
            method: "POST",
            cookie,
            origin: base,
          });
          assert.equal(refreshed.status, 201);
          assert.equal(refreshed.data.refreshToken, undefined);
          const rotated = refreshed.cookie.split(";")[0];
          assert.equal(
            (
              await call("/auth/browser/refresh", {
                method: "POST",
                cookie,
                origin: base,
              })
            ).status,
            401,
          );
          const logout = await call("/auth/browser/logout", {
            method: "POST",
            cookie: rotated,
            origin: base,
          });
          assert.equal(logout.status, 201);
          assert.match(logout.cookie, /Expires=Thu, 01 Jan 1970/);
          assert.equal(
            (await call("/auth/me", { token: result.data.accessToken })).status,
            401,
          );
          assert.equal(
            (await call("/auth/me", { token: refreshed.data.accessToken }))
              .status,
            401,
          );
          assert.equal(
            (
              await call("/auth/browser/refresh", {
                method: "POST",
                cookie: rotated,
                origin: base,
              })
            ).status,
            401,
          );
          admin = (await login("ADMIN")).data;
        },
      );
      await t.test(
        "expired access, expired sessions and API logout are enforced",
        async () => {
          const operator = (await login("OPERATOR")).data;
          const jwt = module.get(require("@nestjs/jwt").JwtService);
          const decoded = jwt.decode(operator.accessToken);
          const expired = jwt.sign(
            {
              id: decoded.id,
              sid: decoded.sid,
              role: decoded.role,
              tokenType: "access",
            },
            { expiresIn: -1 },
          );
          assert.equal(
            (await call("/auth/me", { token: expired })).status,
            401,
          );
          assert.equal(
            (
              await call("/auth/logout", {
                token: operator.accessToken,
                method: "POST",
              })
            ).status,
            201,
          );
          assert.equal(
            (await call("/auth/me", { token: operator.accessToken })).status,
            401,
          );
          assert.equal(
            (
              await call("/auth/refresh", {
                method: "POST",
                body: { refreshToken: operator.refreshToken },
              })
            ).status,
            401,
          );
          const next = (await login("OPERATOR")).data;
          await prisma.authSession.updateMany({
            where: { userId: accounts.OPERATOR.id, revokedAt: null },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
          assert.equal(
            (await call("/auth/me", { token: next.accessToken })).status,
            401,
          );
          assert.equal(
            (
              await call("/auth/refresh", {
                method: "POST",
                body: { refreshToken: next.refreshToken },
              })
            ).status,
            401,
          );
        },
      );
      await t.test(
        "each role's direct API permissions are enforced",
        async () => {
          for (const role of ["OPERATOR", "REVIEWER"]) {
            const token = (await login(role)).data.accessToken;
            for (const path of [
              "/dashboard?date=2026-10-29",
              "/imports",
              "/screenshots?date=2026-10-29",
              "/transactions?date=2026-10-29",
            ])
              assert.equal(
                (await call(path, { token })).status,
                200,
                role + " " + path,
              );
            for (const [path, method, body] of [
              ["/users", "GET"],
              ["/users", "POST", {}],
              ["/users/" + accounts.ADMIN.id, "PATCH", { status: "INACTIVE" }],
              ["/users/" + accounts.ADMIN.id + "/reset-password", "POST"],
              ["/settings/business-wallets", "GET"],
            ])
              assert.equal(
                (await call(path, { token, method, body })).status,
                403,
              );
            const missing = randomUUID();
            assert.equal(
              (
                await call(
                  "/verification/screenshots/" + missing + "/process",
                  { token, method: "POST" },
                )
              ).status,
              404,
            );
            assert.equal(
              (await call("/screenshots", { token, method: "POST", body: {} }))
                .status,
              role === "REVIEWER" ? 403 : 400,
            );
            assert.equal(
              (await call("/imports", { token, method: "POST", body: {} }))
                .status,
              role === "REVIEWER" ? 403 : 400,
            );
            assert.equal(
              (
                await call("/verification/batches", {
                  token,
                  method: "POST",
                  body: {},
                })
              ).status,
              role === "REVIEWER" ? 403 : 400,
            );
            assert.equal(
              (
                await call("/reviews/" + missing + "/resolve", {
                  token,
                  method: "PATCH",
                  body: { action: "REJECT", confirmed: true },
                })
              ).status,
              role === "OPERATOR" ? 403 : 404,
            );
          }
        },
      );
      let staff, temporary;
      await t.test(
        "staff creation hides credentials except the one-time response",
        async () => {
          const created = await call("/users", {
            token: admin.accessToken,
            method: "POST",
            body: {
              displayName: "Staff Test",
              emailOrPhone: "staff@example.test",
              role: "OPERATOR",
            },
          });
          assert.equal(created.status, 201);
          staff = created.data.user;
          temporary = created.data.temporaryPassword;
          assert.equal(temporary.length, 24);
          assert.equal(staff.passwordHash, undefined);
          const listed = await call("/users?page=1", {
            token: admin.accessToken,
          });
          assert.equal(listed.data.pageSize, 50);
          assert.ok(!JSON.stringify(listed.data).includes(temporary));
          assert.equal(
            (await call("/users?page=0", { token: admin.accessToken })).status,
            400,
          );
          assert.equal(
            (
              await call("/users", {
                token: admin.accessToken,
                method: "POST",
                body: {
                  displayName: "Duplicate",
                  emailOrPhone: "staff@example.test",
                  role: "REVIEWER",
                },
              })
            ).status,
            409,
          );
          assert.ok(
            !JSON.stringify(await prisma.auditLog.findMany()).includes(
              temporary,
            ),
          );
        },
      );
      let staffTokens;
      const staffLogin = (pass) =>
        call("/auth/login", {
          method: "POST",
          body: { emailOrPhone: staff.emailOrPhone, password: pass },
        });
      const newPassword = "Updated-staff-password";
      await t.test(
        "temporary credentials only allow identity, change password and logout",
        async () => {
          staffTokens = (await staffLogin(temporary)).data;
          assert.equal(staffTokens.user.mustChangePassword, true);
          assert.equal(
            (await call("/auth/me", { token: staffTokens.accessToken })).status,
            200,
          );
          assert.equal(
            (
              await call("/dashboard?date=2026-10-29", {
                token: staffTokens.accessToken,
              })
            ).data.code,
            "PASSWORD_CHANGE_REQUIRED",
          );
          assert.equal(
            (
              await call("/auth/change-password", {
                token: staffTokens.accessToken,
                method: "POST",
                body: {
                  currentPassword: temporary,
                  newPassword: "က".repeat(25),
                },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await call("/auth/change-password", {
                token: staffTokens.accessToken,
                method: "POST",
                body: { currentPassword: "wrong-password", newPassword },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await call("/auth/change-password", {
                token: staffTokens.accessToken,
                method: "POST",
                body: { currentPassword: temporary, newPassword },
              })
            ).status,
            201,
          );
          assert.equal(
            (await call("/auth/me", { token: staffTokens.accessToken })).status,
            401,
          );
          assert.equal((await staffLogin(temporary)).status, 401);
          staffTokens = (await staffLogin(newPassword)).data;
          assert.equal(staffTokens.user.mustChangePassword, false);
        },
      );
      await t.test(
        "role, deactivation and reset immediately revoke access",
        async () => {
          const update = (body) =>
            call("/users/" + staff.id, {
              token: admin.accessToken,
              method: "PATCH",
              body,
            });
          assert.equal((await update({ role: "REVIEWER" })).status, 200);
          assert.equal(
            (await call("/auth/me", { token: staffTokens.accessToken })).status,
            401,
          );
          staffTokens = (await staffLogin(newPassword)).data;
          assert.equal(staffTokens.user.role, "REVIEWER");
          assert.equal((await update({ status: "INACTIVE" })).status, 200);
          assert.equal(
            (await call("/auth/me", { token: staffTokens.accessToken })).status,
            401,
          );
          assert.equal((await staffLogin(newPassword)).status, 401);
          assert.equal((await update({ status: "ACTIVE" })).status, 200);
          staffTokens = (await staffLogin(newPassword)).data;
          const reset = await call("/users/" + staff.id + "/reset-password", {
            token: admin.accessToken,
            method: "POST",
          });
          assert.equal(reset.status, 201);
          assert.equal(
            (await call("/auth/me", { token: staffTokens.accessToken })).status,
            401,
          );
          assert.equal((await staffLogin(newPassword)).status, 401);
          await prisma.user.update({
            where: { id: staff.id },
            data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) },
          });
          assert.equal(
            (await staffLogin(reset.data.temporaryPassword)).status,
            401,
          );
          const audit = await prisma.auditLog.findMany();
          assert.ok(audit.some((r) => r.action === "PASSWORD_RESET"));
          assert.ok(
            !JSON.stringify(audit).includes(reset.data.temporaryPassword),
          );
        },
      );
      await t.test(
        "Admin self-protection and concurrent privilege changes",
        async () => {
          for (const body of [{ status: "INACTIVE" }, { role: "OPERATOR" }])
            assert.equal(
              (
                await call("/users/" + accounts.ADMIN.id, {
                  token: admin.accessToken,
                  method: "PATCH",
                  body,
                })
              ).status,
              400,
            );
          assert.equal(
            (
              await call("/users/" + accounts.ADMIN.id + "/reset-password", {
                token: admin.accessToken,
                method: "POST",
              })
            ).status,
            400,
          );
          const other = await prisma.user.create({
            data: {
              role: "ADMIN",
              displayName: "Other Admin",
              emailOrPhone: "other@example.test",
              passwordHash: await hash(password, 4),
            },
          });
          const otherToken = (
            await call("/auth/login", {
              method: "POST",
              body: { emailOrPhone: other.emailOrPhone, password },
            })
          ).data.accessToken;
          const results = await Promise.all([
            call("/users/" + other.id, {
              token: admin.accessToken,
              method: "PATCH",
              body: { status: "INACTIVE" },
            }),
            call("/users/" + accounts.ADMIN.id, {
              token: otherToken,
              method: "PATCH",
              body: { status: "INACTIVE" },
            }),
          ]);
          assert.equal(results.filter((r) => r.status === 200).length, 1);
          assert.equal(
            await prisma.user.count({
              where: { role: "ADMIN", status: "ACTIVE" },
            }),
            1,
          );
        },
      );
      await t.test(
        "persistent login and refresh throttles use separate buckets",
        async () => {
          await prisma.authRateLimit.deleteMany();
          for (let i = 0; i < 21; i++)
            assert.equal((await login("OPERATOR")).status, 201);
          assert.equal(
            await prisma.authRateLimit.count({
              where: { key: { startsWith: "login:" } },
            }),
            0,
          );
          for (let i = 0; i < 20; i++)
            assert.equal(
              (
                await login("OPERATOR", {
                  body: {
                    emailOrPhone: accounts.OPERATOR.emailOrPhone,
                    password: "wrong-password",
                  },
                })
              ).status,
              401,
            );
          assert.equal((await login("OPERATOR")).status, 429);
          assert.equal(
            (
              await call("/auth/refresh", {
                method: "POST",
                body: { refreshToken: "invalid-token-with-enough-length" },
              })
            ).status,
            401,
          );
          await prisma.authRateLimit.deleteMany();
          for (let i = 0; i < 120; i++)
            await call("/auth/refresh", {
              method: "POST",
              body: { refreshToken: "invalid-token-with-enough-length" },
            });
          assert.equal(
            (
              await call("/auth/refresh", {
                method: "POST",
                body: { refreshToken: "invalid-token-with-enough-length" },
              })
            ).status,
            429,
          );
          assert.equal((await login("OPERATOR")).status, 201);
          await prisma.authRateLimit.deleteMany();
        },
      );
      if (process.env.AUTH_BROWSER_TEST === "1")
        await t.test(
          "real browser authentication and staff journeys",
          async () => {
            // The browser helper creates its own independent fixtures in this schema.
            await require("../scripts/auth-browser.cjs")({
              base,
              prisma,
              password,
              google: module.get(require("../dist/auth/google-auth").GoogleAuth),
            });
          },
        );
    } finally {
      if (app) await app.close();
      await root.$executeRawUnsafe(
        'DROP SCHEMA IF EXISTS "' + schema + '" CASCADE',
      );
      await root.$disconnect();
    }
  },
);
