const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { resolve } = require("node:path");

// Real HTTP/API/database journey; OCR text is supplied by the integration adapter.
module.exports = async function browserSmoke({
  base,
  email,
  password,
  receiptId,
  image,
  noMatchImage,
  billingImage,
  statement,
  setOcrAvailable,
}) {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "../../frontend/node_modules/playwright");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const screenshots = process.env.MVP_SCREENSHOT_DIR
    ? resolve(process.env.MVP_SCREENSHOT_DIR)
    : resolve(__dirname, "../../.qa-tools/screenshots");
  await mkdir(screenshots, { recursive: true });
  try {
    await page.goto(base);
    assert.equal(await page.locator("html").getAttribute("lang"), "my");
    await page.locator("#language-toggle").click();
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await page.locator("#workspace").waitFor({ state: "visible" });
    await page.locator('[data-source="saved"]').click();
    await page.locator("#business-date").fill("2026-10-27");
    await page.locator("#business-date").dispatchEvent("change");
    await page.locator(`[data-select="${receiptId}"]`).click();
    await page
      .locator("#result-title")
      .filter({ hasText: "This receipt matches" })
      .waitFor();
    assert.equal(
      await page.locator("#approve, #review-confirm, #details-form").count(),
      0,
    );
    await page.locator("#open-import").click();
    await page
      .locator("#import-file")
      .setInputFiles({
        name: "browser-history.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: statement,
      });
    await page.locator("#import-submit").click();
    await page
      .locator("#notice")
      .filter({ hasText: "Excel updated" })
      .waitFor();
    await page.locator("#business-date").fill("2026-10-28");
    await page.locator("#business-date").dispatchEvent("change");
    const upload = async (bytes) => {
      // Import success is announced before its follow-up history refresh ends.
      // Wait for the picker to be ready, just as a real file selection does.
      await page.waitForFunction(
        () => !document.querySelector("#receipt-file").disabled,
      );
      await page
        .locator("#receipt-file")
        .setInputFiles({
          name: "synthetic-receipt.png",
          mimeType: "image/png",
          buffer: bytes,
        });
      await page.locator("#start-check").click();
    };
    await upload(image);
    await page
      .locator("#result-title")
      .filter({ hasText: "This receipt matches" })
      .waitFor();
    await page.locator("#receipt-image").waitFor({ state: "visible" });
    // The local image preview can render before the separate detail request.
    await page.locator("#review-detail").getByText("BROWSER001", { exact: true }).first().waitFor();
    assert.equal(
      await page.locator("#business-date").count(),
      0,
    );
    assert.match(
      await page.locator("#review-detail").textContent(),
      /BROWSER001/,
    );
    assert.equal(await page.locator("#ocr-warning").isVisible(), false);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(screenshots, "automatic-match-desktop.png"),
      fullPage: true,
    });
    await upload(image);
    await page
      .locator("#result-title")
      .filter({ hasText: "This image was already uploaded" })
      .waitFor();
    assert.equal(
      await page.locator("#review-detail .badge.warning").textContent(),
      "Duplicate",
    );
    await upload(noMatchImage);
    await page
      .locator("#result-title")
      .filter({ hasText: "Not found in Excel" })
      .waitFor();
    assert.equal(
      await page.locator("#review-detail .badge.danger").textContent(),
      "Not found",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(screenshots, "automatic-no-match-mobile.png"),
      fullPage: true,
    });
    setOcrAvailable(false);
    await page.locator("#run-ocr").click();
    await page
      .locator("#result-title")
      .filter({ hasText: "Receipt reading is unavailable" })
      .waitFor();
    await page.locator("#ocr-warning").waitFor({ state: "visible" });
    await page.screenshot({
      path: resolve(screenshots, "ocr-unavailable-mobile.png"),
      fullPage: true,
    });
    setOcrAvailable(true);
    await upload(billingImage);
    await page
      .locator("#result-title")
      .filter({ hasText: "Receipt reading is unavailable" })
      .waitFor();
    await page
      .locator(".result-reason")
      .filter({ hasText: "Google Vision billing is disabled" })
      .waitFor();
    await page.screenshot({
      path: resolve(screenshots, "ocr-billing-disabled-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await page.locator("#logout").click();
    await page.locator("#login-view").waitFor({ state: "visible" });
  } finally {
    setOcrAvailable(true);
    await browser.close();
  }
};
