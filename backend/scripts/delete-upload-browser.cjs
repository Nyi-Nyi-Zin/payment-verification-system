const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { resolve } = require("node:path");

module.exports = async function deleteUploadBrowser({
  base,
  email,
  password,
  statement,
  image,
  duplicateImage,
  prisma,
}) {
  const { chromium } = require(
    process.env.PLAYWRIGHT_MODULE || "../../frontend/node_modules/playwright",
  );
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const screenshots = resolve(__dirname, "../../.qa-tools/delete-uploads");
  await mkdir(screenshots, { recursive: true });
  const errors = [];
  let deletes = 0;
  const original = await prisma.paymentScreenshot.findFirst({
    orderBy: { receivedAt: "asc" },
  });
  const oldReceipt = await prisma.paymentScreenshot.create({
    data: {
      source: "WEB",
      businessDate: new Date("2020-01-02T00:00:00Z"),
      receivedAt: new Date("2020-01-02T00:00:00Z"),
      storageKey: original.storageKey,
      fileHash: "old-receipt-discoverability-fixture",
      mimeType: original.mimeType,
      fileSizeBytes: original.fileSizeBytes,
      submittedProvider: "KBZPAY",
      status: "UNMATCHED",
    },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "DELETE") deletes++;
  });
  try {
    await page.addInitScript(() =>
      localStorage.setItem("paymentDesk.language", "en"),
    );
    await page.goto(base);
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await page.locator("#workspace").waitFor();
    assert.equal(
      await page.locator('[data-source="saved"]').getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.locator("#business-date").inputValue(), "");
    await page.locator("#manage-saved-receipts").click();
    await page.locator(`[data-select="${oldReceipt.id}"]`).click();
    await page
      .locator("#delete-selected-receipt")
      .waitFor({ state: "visible" });
    await page.locator("#review-detail").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(screenshots, "old-receipt-delete-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#language-toggle").click();
    await page.locator("#delete-selected-receipt").scrollIntoViewIfNeeded();
    assert.equal(
      await page.locator("#delete-selected-receipt").innerText(),
      "ပြေစာ ဖျက်မည်",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(screenshots, "old-receipt-delete-mobile.png"),
      fullPage: false,
    });
    await page.locator("#delete-selected-receipt").click();
    await page.locator("dialog:visible [data-confirm-delete]").click();
    await page
      .locator(`[data-select="${oldReceipt.id}"]`)
      .waitFor({ state: "hidden" });
    assert.equal(
      await prisma.paymentScreenshot.findUnique({
        where: { id: oldReceipt.id },
      }),
      null,
    );
    deletes = 0;
    await page.locator("#language-toggle").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#business-date").fill("2026-10-27");
    await page.locator("#manage-saved-receipts").click();
    assert.equal(await page.locator("#business-date").inputValue(), "");
    await page.locator("#open-import").click();
    await page.locator("#import-file").setInputFiles({
      name: "delete-browser.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: statement,
    });
    const importResponse = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/imports"),
    );
    await page.locator("#import-submit").click();
    const imported = await (await importResponse).json();
    await page.locator("#notice").waitFor();
    const upload = async (bytes = image) => {
      await page.waitForFunction(
        () => !document.querySelector("#receipt-file").disabled,
      );
      await page.locator("#receipt-file").setInputFiles({
        name: "delete-receipt.png",
        mimeType: "image/png",
        buffer: bytes,
      });
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" && r.url().endsWith("/screenshots"),
      );
      await page.locator("#start-check").click();
      const body = await (await response).json();
      await page
        .locator(`[data-delete-upload="${body.screenshotId}"]`)
        .first()
        .waitFor({ state: "visible" });
      return body.screenshotId;
    };
    const id = await upload();
    await upload(); // Two page-local rows point to the same durable receipt.
    await page.locator(`[data-delete-upload="${id}"]`).first().click();
    let dialog = page.locator("dialog:visible");
    await dialog.waitFor();
    await page.screenshot({
      path: resolve(screenshots, "receipt-confirm-desktop.png"),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(deletes, 0);
    assert.ok(await prisma.paymentScreenshot.findUnique({ where: { id } }));
    await page.locator(`[data-delete-upload="${id}"]`).first().click();
    await page.locator("dialog:visible [data-confirm-delete]").click();
    await page
      .locator(`[data-delete-upload="${id}"]`)
      .first()
      .waitFor({ state: "hidden" });
    assert.equal(
      await prisma.paymentScreenshot.findUnique({ where: { id } }),
      null,
    );
    assert.equal(await page.locator("#receipt-image").count(), 0);
    await page.reload();
    await page.locator("#workspace").waitFor();
    await page.locator('[data-source="saved"]').click();
    await page.locator("#business-date").fill("2026-10-27");
    assert.equal(await page.locator(`[data-select="${id}"]`).count(), 0);
    // Delete a different receipt directly from saved history.
    await page.locator('[data-source="batch"]').click();
    const savedId = await upload();
    const blockedId = await upload(duplicateImage);
    await page
      .locator("#result-title")
      .filter({ hasText: "This payment was already used" })
      .waitFor();
    const retryBlocked = page.waitForResponse((r) =>
      r.url().endsWith(`/screenshots/${blockedId}/process`),
    );
    await page.locator('[data-action="retry"]').click();
    assert.equal((await (await retryBlocked).json()).status, "DUPLICATE");
    await page.locator('[data-source="saved"]').click();
    await page.locator("#business-date").fill("2026-10-27");
    await page.locator(`[data-select="${savedId}"]`).click();
    await page.locator("#delete-selected-receipt").click();
    await page.locator("dialog:visible [data-confirm-delete]").click();
    await page
      .locator(`[data-select="${savedId}"]`)
      .waitFor({ state: "hidden" });
    await page.locator(`[data-select="${blockedId}"]`).click();
    const retryReleased = page.waitForResponse((r) =>
      r.url().endsWith(`/screenshots/${blockedId}/process`),
    );
    await page.locator('[data-action="retry"]').click();
    assert.equal((await (await retryReleased).json()).status, "VERIFIED");
    await page
      .locator("#result-title")
      .filter({ hasText: "This receipt matches" })
      .waitFor();
    assert.ok(
      await prisma.usedTransaction.findUnique({
        where: { screenshotId: blockedId },
      }),
    );
    await page.screenshot({
      path: resolve(screenshots, "duplicate-rechecked-after-delete.png"),
      fullPage: true,
    });
    await page.locator('[data-view="imports"]:visible').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#language-toggle").click();
    await page.locator(`[data-delete-upload="${imported.importId}"]`).click();
    dialog = page.locator("dialog:visible");
    await dialog.waitFor();
    const rowHeight = await page
      .locator("#imports-table tr")
      .first()
      .evaluate((row) => row.getBoundingClientRect().height);
    assert.ok(
      rowHeight > 0 && rowHeight < 160,
      "Mobile import rows must stay compact inside horizontal table scrolling",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(screenshots, "import-confirm-my-mobile.png"),
      fullPage: true,
    });
    // Transient server failure stays in the dialog and can be retried.
    await page.route(
      `**/api/v1/imports/${imported.importId}`,
      async (route) => {
        if (route.request().method() !== "DELETE") return route.continue();
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Injected deletion outage" }),
        });
      },
    );
    await dialog.locator("[data-confirm-delete]").click();
    await dialog.locator('[role="alert"]').waitFor();
    assert.ok(
      await prisma.paymentImport.findUnique({
        where: { id: imported.importId },
      }),
    );
    await page.unroute(`**/api/v1/imports/${imported.importId}`);
    await dialog.locator("[data-confirm-delete]").click();
    await page
      .locator(`[data-delete-upload="${imported.importId}"]`)
      .waitFor({ state: "hidden" });
    assert.equal(
      await prisma.paymentImport.findUnique({
        where: { id: imported.importId },
      }),
      null,
    );
    await page.reload();
    await page.locator("#workspace").waitFor();
    await page.locator('[data-view="imports"]:visible').click();
    assert.equal(
      await page.locator(`[data-delete-upload="${imported.importId}"]`).count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Upload deletion browser passed: confirmation/cancel, batch duplicate-row cleanup, saved receipts, reload persistence, Excel deletion, transient failure/retry, Myanmar/mobile layout.",
    );
  } finally {
    await browser.close();
  }
};
