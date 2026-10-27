const assert = require("node:assert/strict");
module.exports = async function browserSmoke({
  base,
  email,
  password,
  receiptId,
}) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const launchOptions = { headless: true };
  if (process.env.CHROMIUM_MODULE) {
    const loaded = require(process.env.CHROMIUM_MODULE);
    const binary = loaded.default || loaded;
    launchOptions.executablePath = await binary.executablePath();
    launchOptions.args = binary.args;
  }
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(base);
    await page.getByLabel("Email or phone").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator("#workspace").waitFor({ state: "visible" });
    await page.locator("#business-date").fill("2026-10-27");
    await page.locator("#business-date").dispatchEvent("change");
    await page.locator(`[data-receipt="${receiptId}"]`).click();
    await page.locator("#details-form").waitFor();
    await page.locator('#details-form input[name="amount"]').fill("20000");
    await page
      .locator('#details-form input[name="transactionId"]')
      .fill("KBZ100002");
    await page.locator('#details-form input[name="time"]').fill("11:00");
    await page.getByRole("button", { name: "Find match", exact: true }).click();
    await page
      .getByText("Transaction ID and amount match the imported history.", {
        exact: false,
      })
      .waitFor();
    await page.locator("#receipt-image").waitFor({ state: "visible" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path:
        process.env.MVP_DESKTOP_SCREENSHOT || "/tmp/payment-mvp-desktop.png",
      fullPage: true,
    });
    await page.locator("#review-confirm").check();
    await page
      .getByRole("button", { name: "Approve payment", exact: true })
      .click();
    await page
      .getByText(
        "Payment approved. This transaction is now reserved for this receipt.",
        { exact: true },
      )
      .waitFor();
    await page.locator("#review-detail .badge.success").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: process.env.MVP_MOBILE_SCREENSHOT || "/tmp/payment-mvp-mobile.png",
      fullPage: true,
    });
    await page.locator('[data-view="transactions"]').click();
    await page.locator("#transactions-view").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.locator("#login-view").waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
};
