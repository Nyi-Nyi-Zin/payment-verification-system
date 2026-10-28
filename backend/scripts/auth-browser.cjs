const assert = require("node:assert/strict");
const { mkdtemp, mkdir, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve, dirname, basename } = require("node:path");
const { hash } = require("bcryptjs");

module.exports = async function authBrowser({
  base,
  prisma,
  password,
  google,
}) {
  const { chromium } = require(
    process.env.PLAYWRIGHT_MODULE || "../../frontend/node_modules/playwright",
  );
  const directory = await mkdtemp(join(tmpdir(), "payment-auth-browser-"));
  const screenshots = resolve(__dirname, "../../.qa-tools/authentication");
  await mkdir(screenshots, { recursive: true });
  const options = {
    headless: true,
    viewport: { width: 1440, height: 1000 },
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {}),
  };
  let context, otherBrowser;
  const errors = [];
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      displayName: "Browser Admin",
      emailOrPhone: "browser-admin@example.test",
      passwordHash: await hash(password, 4),
    },
  });
  const watch = (page) =>
    page.on("pageerror", (error) => errors.push(error.message));
  const login = async (
    page,
    identifier,
    secret,
    destination = "#workspace",
  ) => {
    await page.locator("#login-view").waitFor();
    await page.locator("#login-email").fill(identifier);
    await page.locator("#login-password").fill(secret);
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/browser/login") &&
        response.request().method() === "POST",
    );
    await page.locator("#login-submit").click();
    const result = await (await response).json();
    await page.locator(destination).waitFor();
    return result;
  };
  try {
    context = await chromium.launchPersistentContext(directory, options);
    await context.addInitScript(() =>
      localStorage.setItem("paymentDesk.language", "en"),
    );
    let page = context.pages()[0];
    watch(page);
    await page.goto(base);
    await page.locator("#login-view").waitFor();
    await page.locator("#toggle-register").click();
    await page.locator("#register-displayName").fill("Browser Signup");
    await page
      .locator("#register-emailOrPhone")
      .fill("browser-signup@example.test");
    await page.locator("#register-password").fill("Browser-signup-password");
    await page.locator("#register-confirmPassword").fill("Different-password");
    await page.locator("#register-submit").click();
    await page.locator("#register-confirmPassword-error").waitFor();
    for (const locale of ["en", "my"]) {
      if (locale === "my") await page.locator("#language-toggle").click();
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.screenshot({
          path: join(screenshots, `register-${locale}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.locator("#language-toggle").click();
    await page
      .locator("#register-confirmPassword")
      .fill("Browser-signup-password");
    await page.locator("#register-submit").click();
    await page.locator("#workspace").waitFor();
    assert.equal(
      (
        await prisma.user.findUnique({
          where: { emailOrPhone: "browser-signup@example.test" },
        })
      ).role,
      "OPERATOR",
    );
    assert.equal(await page.locator('[data-view="staff"]').count(), 0);
    await page.reload();
    await page.locator("#workspace").waitFor();
    await page.locator("#logout").click();
    await page.locator("#login-view").waitFor();
    // Use a simulated provider return to exercise the real UI/state/cookie/session path.
    if (google) {
      const googleTab = await context.newPage();
      watch(googleTab);
      await googleTab.goto(base);
      await googleTab.locator("#login-view").waitFor();
      const originalVerify = google.verify;
      google.verify = async () => ({
        sub: "browser-google-subject",
        email: "browser-google@gmail.com",
        name: "Browser Google",
      });
      await page.route("https://accounts.google.com/**", (route) => {
        const state = new URL(route.request().url()).searchParams.get("state");
        return route.fulfill({
          status: 302,
          headers: {
            location:
              base +
              "/api/v1/auth/browser/google/callback?" +
              new URLSearchParams({ state, code: "simulated-browser-code" }),
          },
          body: "",
        });
      });
      try {
        await page.locator("#google-sign-in").click();
        await page.locator("#workspace").waitFor();
        await googleTab.locator("#workspace").waitFor();
        assert.equal(
          await page.locator("#account-name").innerText(),
          "Browser Google",
        );
        assert.equal(await page.locator("#open-change-password").count(), 0);
        await page.reload();
        await page.locator("#workspace").waitFor();
        await page.locator("#logout").click();
        await page.locator("#login-view").waitFor();
      } finally {
        google.verify = originalVerify;
        await googleTab.close();
        await page.unroute("https://accounts.google.com/**");
      }
    }
    const initial = await login(page, admin.emailOrPhone, password);
    assert.equal(initial.refreshToken, undefined);
    assert.equal(
      (await page.evaluate(() => document.cookie)).includes(
        "paymentdesk_refresh",
      ),
      false,
    );
    const cookies = await context.cookies();
    const cookie = cookies.find(
      (value) => value.name === "paymentdesk_refresh",
    );
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "Strict");
    assert.ok(cookie.expires > Date.now() / 1000 + 29 * 86400);
    await page.reload();
    await page.locator("#workspace").waitFor();
    const tab = await context.newPage();
    watch(tab);
    await tab.goto(base);
    await tab.locator("#workspace").waitFor();
    await Promise.all([page.reload(), tab.reload()]);
    await Promise.all([
      page.locator("#workspace").waitFor(),
      tab.locator("#workspace").waitFor(),
    ]);
    // Simulate a transient backend outage while the static application remains available.
    await page.route("**/auth/browser/refresh", (route) =>
      route.abort("failed"),
    );
    await page.reload();
    await page.locator("#retry-session").waitFor();
    assert.equal(await page.locator("#login-view").count(), 0);
    await page.unroute("**/auth/browser/refresh");
    await page.locator("#retry-session").click();
    await page.locator("#workspace").waitFor();
    await tab.locator("#logout").click();
    await Promise.all([
      page.locator("#login-view").waitFor(),
      tab.locator("#login-view").waitFor(),
    ]);
    await login(page, admin.emailOrPhone, password);
    await tab.locator("#workspace").waitFor();
    await context.close();
    context = await chromium.launchPersistentContext(directory, options);
    page = context.pages()[0];
    watch(page);
    assert.ok(
      (await context.cookies()).some(
        (value) => value.name === "paymentdesk_refresh",
      ),
      "Persistent browser must retain the refresh cookie after restart",
    );
    await page.goto(base);
    await page.locator("#workspace").waitFor();
    await page.screenshot({
      path: join(screenshots, "restored-session.png"),
      fullPage: true,
    });
    // A separate browser is a separate device: its login invalidates the first.
    otherBrowser = await chromium.launch(options);
    const otherContext = await otherBrowser.newContext(options);
    await otherContext.addInitScript(() =>
      localStorage.setItem("paymentDesk.language", "en"),
    );
    const adminPage = await otherContext.newPage();
    watch(adminPage);
    await adminPage.goto(base);
    await login(adminPage, admin.emailOrPhone, password);
    await page.locator("#refresh").click();
    await page.locator("#login-view").waitFor();
    assert.equal(await page.locator("#workspace").count(), 0);
    assert.equal(
      await prisma.authSession.count({
        where: { userId: admin.id, revokedAt: null },
      }),
      1,
    );
    await adminPage.locator('[data-view="staff"]:visible').click();
    await adminPage.locator("#staff-view").waitFor();
    await adminPage.locator("#create-staff").click();
    await adminPage.locator("#staff-name").fill("Browser Operator");
    await adminPage
      .locator("#staff-identifier")
      .fill("browser-staff@example.test");
    await adminPage.locator("#staff-role").selectOption("OPERATOR");
    await adminPage.locator("#save-staff").click();
    await adminPage.locator("#staff-credentials").waitFor({ state: "visible" });
    const temporary = await adminPage
      .locator("#temporary-password")
      .textContent();
    assert.equal(temporary.length, 24);
    await adminPage.locator("#dismiss-credentials").click();
    assert.equal(await adminPage.locator("#temporary-password").count(), 0);
    const staff = await prisma.user.findUniqueOrThrow({
      where: { emailOrPhone: "browser-staff@example.test" },
    });
    await adminPage.screenshot({
      path: join(screenshots, "staff-desktop.png"),
      fullPage: true,
    });
    await login(
      page,
      staff.emailOrPhone,
      temporary,
      "#required-password-change",
    );
    assert.equal(await page.locator("#workspace").count(), 0);
    await page.locator("#currentPassword").fill(temporary);
    await page.locator("#newPassword").fill("Browser-new-password");
    await page.locator("#confirmPassword").fill("Browser-new-password");
    await page.locator("#change-password-submit").click();
    await page.locator("#password-changed").waitFor();
    await login(page, staff.emailOrPhone, "Browser-new-password");
    assert.equal(await page.locator('[data-view="staff"]').count(), 0);
    assert.equal(await page.locator("#receipt-file").count(), 1);
    await adminPage.locator('[data-edit-staff="' + staff.id + '"]').click();
    await adminPage.locator("#staff-role").selectOption("REVIEWER");
    await adminPage.locator("#save-staff").click();
    await adminPage.locator("#staff-editor").waitFor({ state: "hidden" });
    await page.locator("#refresh").click();
    await page.locator("#login-view").waitFor();
    await login(page, staff.emailOrPhone, "Browser-new-password");
    assert.equal(await page.locator("#receipt-file").count(), 0);
    assert.equal(await page.locator("#open-import").count(), 0);
    assert.equal(await page.locator('[data-view="staff"]').count(), 0);
    // Reset the user's password through the Admin interface and invalidate their session.
    adminPage.once("dialog", (dialog) => dialog.accept());
    await adminPage.locator('[data-edit-staff="' + staff.id + '"]').click();
    await adminPage.locator("#reset-staff-password").click();
    await adminPage.locator("#staff-credentials").waitFor({ state: "visible" });
    await adminPage.locator("#dismiss-credentials").click();
    await page.locator("#refresh").click();
    await page.locator("#login-view").waitFor();
    // Staff pagination must be driven by the server, including page 2.
    await prisma.user.createMany({
      data: Array.from({ length: 51 }, (_, index) => ({
        role: "OPERATOR",
        status: "INACTIVE",
        displayName: "Pagination " + index,
        emailOrPhone: "pagination-" + index + "@example.test",
      })),
    });
    await adminPage.reload();
    await adminPage.locator("#workspace").waitFor();
    await adminPage.locator('[data-view="staff"]:visible').click();
    await adminPage.locator('[data-page="staff-next"]').click();
    await adminPage.locator("#staff-page").filter({ hasText: "2" }).waitFor();
    assert.ok((await adminPage.locator("[data-staff]").count()) < 50);
    await adminPage.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await adminPage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await adminPage.screenshot({
      path: join(screenshots, "staff-mobile.png"),
      fullPage: true,
    });
    await adminPage.locator("#logout").click();
    await adminPage.locator("#login-view").waitFor();
    await adminPage.reload();
    await adminPage.locator("#login-view").waitFor();
    assert.equal(
      (await otherContext.cookies()).some(
        (value) => value.name === "paymentdesk_refresh",
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Browser passed: registration, bilingual responsive validation, simulated Google callback, reload, browser restart, tabs, network retry, replacement login, staff create/reset/roles, required password change, pagination, mobile, logout.",
    );
  } finally {
    if (context) await context.close();
    if (otherBrowser) await otherBrowser.close();
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith("payment-auth-browser-")
    )
      throw new Error("Unexpected browser profile path");
    await rm(directory, { recursive: true, force: true });
  }
};
