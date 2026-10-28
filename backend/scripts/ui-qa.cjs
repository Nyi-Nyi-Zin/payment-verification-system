const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const { chromium } = require(
    process.env.PLAYWRIGHT_MODULE || "../../frontend/node_modules/playwright",
  );
  const root = path.resolve(__dirname, "../frontend-dist");
  const screenshots = process.env.UI_SCREENSHOT_DIR
    ? path.resolve(process.env.UI_SCREENSHOT_DIR)
    : path.resolve(__dirname, "../../.qa-tools/next-ui");
  await fs.mkdir(screenshots, { recursive: true });
  const fixture = await fs.readFile(
    path.resolve(__dirname, "../test/fixtures/kbzpay-synthetic.png"),
  );
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://local").pathname,
    );
    const file = path.resolve(
      root,
      pathname === "/" ? "index.html" : "." + pathname,
    );
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await fs.readFile(file);
      response.setHeader(
        "Content-Type",
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".mjs": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".ttf": "font/ttf",
          ".woff2": "font/woff2",
        }[path.extname(file)] || "application/octet-stream",
      );
      response.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self' ${JSON.parse(await fs.readFile(path.join(root, "csp-hashes.json"), "utf8")).join(" ")}; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
      );
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to|hydration/i.test(message.text()))
      errors.push(message.text());
  });
  page.on("request", (request) => {
    if (
      !request.url().startsWith(base) &&
      !/^(blob:|data:)/.test(request.url())
    )
      externalRequests.push(request.url());
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const records = new Map();
  const uploads = [],
    rechecks = [];
  let active = 0,
    maximumActive = 0,
    gate = null,
    networkAttempts = 0,
    ocrConfigured = true;
  let expireSession = false,
    importsFetches = 0;
  let authenticatedUser = null;
  const walletRequests = [];
  const makeRecord = (
    id,
    status = "VERIFIED",
    reasonCode = "EXACT_TRANSACTION_ID",
    day = "2026-10-27",
  ) => ({
    id,
    status,
    source: "WEB",
    businessDate: day + "T00:00:00.000Z",
    receivedAt: today + "T00:00:00.000Z",
    lastError: status === "FAILED" ? reasonCode : null,
    ocrResults:
      status === "FAILED"
        ? []
        : [
            {
              extractedAmount: "20000.00",
              extractedTransactionId: "KBZ100002",
              extractedDate: day + "T00:00:00.000Z",
              extractedTime: "11:00 AM",
              extractedReceiver: "Cloud Nine",
            },
          ],
    verificationResults: [
      {
        reasonCode,
        transaction:
          status === "VERIFIED" || status === "DUPLICATE"
            ? {
                id: "transaction-" + id,
                externalTransactionId: "KBZ100002",
                amount: "20000.00",
                businessDate: day + "T00:00:00.000Z",
                transactionAtUtc: day + "T04:30:00.000Z",
              }
            : null,
      },
    ],
  });
  records.set(
    "saved-demo",
    makeRecord("saved-demo", "VERIFIED", "EXACT_TRANSACTION_ID", today),
  );
  await page.route(base + "/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      endpoint = url.pathname.replace("/api/v1", "");
    let data = {},
      status = 200;
    if (expireSession && endpoint !== "/auth/browser/login")
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: "{}",
      });
    if (endpoint.endsWith("/image"))
      return route.fulfill({ contentType: "image/png", body: fixture });
    if (endpoint === "/auth/browser/login") {
      authenticatedUser = {
          id: "ui-user",
          role: request.postDataJSON().emailOrPhone.startsWith("reviewer") ? "REVIEWER" : "ADMIN",
          emailOrPhone: request.postDataJSON().emailOrPhone,
          mustChangePassword: false,
      };
      data = {
        accessToken: "ui-test-token",
        refreshToken: "ui-test-refresh",
        user: authenticatedUser,
      };
    } else if (endpoint === "/auth/browser/logout") { authenticatedUser = null; data = {}; }
    else if (endpoint === "/auth/browser/refresh") {
      if (!authenticatedUser) return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      data = {
        accessToken: "ui-test-token-2",
        user: authenticatedUser,
      };
    }
    else if (endpoint === "/dashboard") {
      const receipts = {};
      for (const record of records.values())
        if (record.businessDate.startsWith(url.searchParams.get("date")))
          receipts[record.status] = (receipts[record.status] || 0) + 1;
      data = {
        transactions: 4,
        imports: 1,
        receipts,
        ocrConfigured,
        ocrDriver: "tesseract",
      };
    } else if (endpoint === "/screenshots" && request.method() === "POST") {
      const filename =
        request
          .postDataBuffer()
          .toString()
          .match(/filename="([^"]+)"/)?.[1] || "";
      uploads.push(filename);
      active++;
      maximumActive = Math.max(maximumActive, active);
      if (gate) {
        const held = gate;
        gate = null;
        await held;
      }
      if (filename === "network.png" && ++networkAttempts === 1) {
        active--;
        return route.abort("failed");
      }
      let receiptStatus = "VERIFIED",
        reason = "EXACT_TRANSACTION_ID";
      if (filename === "local-setup.png") {
        receiptStatus = "FAILED";
        reason = "OCR_LOCAL_MODELS_MISSING";
      }
      if (filename === "missing.png") {
        receiptStatus = "UNMATCHED";
        reason = "TRANSACTION_ID_NOT_FOUND";
      }
      if (filename === "mismatch.jpg") {
        receiptStatus = "UNMATCHED";
        reason = "TRANSACTION_ID_AMOUNT_MISMATCH";
      }
      if (filename === "unreadable.png") {
        receiptStatus = "FAILED";
        reason = "OCR_FIELDS_INCOMPLETE";
      }
      if (filename === "used-payment.png") {
        receiptStatus = "DUPLICATE";
        reason = "TRANSACTION_ALREADY_USED";
      }
      const duplicate = filename === "duplicate.png";
      const id = duplicate ? "file-good-a.png" : "file-" + filename;
      const day = filename === "good-b.webp" ? "2026-10-26" : "2026-10-27";
      if (!duplicate)
        records.set(id, makeRecord(id, receiptStatus, reason, day));
      data = {
        screenshotId: id,
        status: receiptStatus,
        reasonCode: duplicate ? undefined : reason,
        duplicate,
        businessDate: day,
      };
      status = 201;
      active--;
    } else if (endpoint.startsWith("/verification/screenshots/")) {
      const id = decodeURIComponent(endpoint.split("/")[3]);
      rechecks.push(id);
      records.set(id, makeRecord(id));
      data = {
        screenshotId: id,
        status: "VERIFIED",
        reasonCode: "EXACT_TRANSACTION_ID",
        businessDate: "2026-10-27",
      };
      status = 201;
    } else if (endpoint === "/screenshots") {
      const date = url.searchParams.get("date");
      let items = [...records.values()].filter((record) =>
        !date || record.businessDate.startsWith(date),
      );
      const filter = url.searchParams.get("status");
      if (filter && filter !== "ALL")
        items = items.filter((record) => record.status === filter);
      data = { items, total: items.length, page: 1, pageSize: 50 };
    } else if (endpoint.startsWith("/screenshots/"))
      data = records.get(decodeURIComponent(endpoint.split("/")[2])) || {};
    else if (endpoint === "/imports" && request.method() === "POST") {
      data = {
        parsedRows: 335,
        skippedRows: 0,
        errorRows: 0,
        duplicate: false,
      };
      status = 201;
    } else if (
      endpoint.startsWith("/imports/") &&
      endpoint.endsWith("/errors")
    ) {
      data = [
        {
          sourceRowNumber: 7,
          errorCode: "INVALID_AMOUNT",
          errorMessage: "Synthetic invalid amount row",
        },
      ];
    } else if (endpoint === "/imports") {
      importsFetches++;
      const current = Number(url.searchParams.get("page") || 1);
      const items = Array.from({ length: 51 }, (_, index) => ({
        id: index === 0 ? "import-demo" : "import-" + index,
        fileName:
          index === 0
            ? "KBZPay_Statement_2026-10-28.xlsx"
            : `Statement-${index}.xlsx`,
        status: index === 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
        parsedRows: 335,
        totalRows: 336,
        errorRows: index === 0 ? 1 : 0,
        createdAt: today + "T00:00:00.000Z",
      }));
      data = {
        items: items.slice((current - 1) * 50, current * 50),
        total: 51,
        page: current,
        pageSize: 50,
      };
    } else if (endpoint === "/transactions") {
      walletRequests.push(url.searchParams.get("search"));
      data = {
        items: [
          {
            id: "transaction-demo",
            externalTransactionId: "KBZ100002",
            amount: "20000.00",
            transactionAtUtc: "2026-10-27T04:30:00.000Z",
            usedTransaction: { screenshotId: "saved-demo" },
          },
        ],
        total: 1,
      };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  const wait = async (predicate) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > 10000)
        throw new Error("Fixture state did not settle");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  const file = (name, type = "image/png", buffer = fixture) => ({
    name,
    mimeType: type,
    buffer,
  });
  const select = (name) =>
    page.locator("[data-select]").filter({ hasText: name }).first().click();
  try {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator("html").getAttribute("lang"), "my");
    for (const locale of ["my", "en"]) {
      if ((await page.locator("html").getAttribute("lang")) !== locale)
        await page.locator("#language-toggle").click();
      for (const [width, height] of [
        [1440, 900],
        [1280, 720],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => document.fonts.ready);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.screenshot({
          path: path.join(screenshots, `login-${locale}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator("#language-toggle").click();
    await page.locator("#language-toggle").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    await page.locator("#login-submit").click();
    assert.equal(await page.locator('#login-form [role="alert"]').count(), 2);
    await page.locator("#login-email").fill("operator@example.test");
    await page.locator("#login-password").fill("synthetic-password");
    await page.locator("#login-submit").click();
    await page.locator("#workspace").waitFor();
    await page.locator("#open-import").click();
    await page
      .locator("#import-file")
      .setInputFiles(
        file(
          "history.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          Buffer.from("synthetic workbook"),
        ),
      );
    await page
      .locator("#import-file")
      .setInputFiles(file("wrong.csv", "text/csv"));
    await page.locator("#excel-error").filter({ hasText: "xlsx" }).waitFor();
    await page
      .locator("#import-file")
      .setInputFiles(
        file(
          "history.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      );
    const importsBeforeSubmit = importsFetches;
    await page.locator("#import-submit").click();
    await page
      .locator("#notice")
      .filter({ hasText: "Excel updated" })
      .waitFor();
    await wait(() => importsFetches > importsBeforeSubmit);
    await page
      .locator("#receipt-file")
      .setInputFiles([
        file("good-a.png"),
        file("good-b.webp", "image/webp"),
        file("duplicate.png"),
        file("used-payment.png"),
        file("missing.png"),
        file("mismatch.jpg", "image/jpeg"),
        file("unreadable.png"),
        file("network.png"),
        file("not-a-receipt.txt", "text/plain"),
        file("empty.png", "image/png", Buffer.alloc(0)),
        file("too-big.png", "image/png", Buffer.alloc(10 * 1024 * 1024 + 1)),
      ]);
    assert.equal(await page.locator("[data-select]").count(), 11);
    const invalidButton = page
      .locator("[data-remove]")
      .filter({ has: page.locator(".icon") });
    assert.ok((await invalidButton.count()) > 0);
    await page
      .getByRole("button", { name: "Remove empty.png", exact: true })
      .click();
    assert.equal(await page.locator("[data-select]").count(), 10);
    let release;
    gate = new Promise((resolve) => (release = resolve));
    await page.locator("#start-check").click();
    await wait(() => uploads.length === 1);
    assert.equal(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      true,
    );
    await page.locator("#language-toggle").click();
    assert.equal(await page.locator("html").getAttribute("lang"), "my");
    await page.locator("#pause-check").click();
    await page.locator('[data-view="imports"]:visible').click();
    assert.equal(await page.locator("#global-progress").isVisible(), true);
    release();
    await page.locator('[data-view="review"]:visible').click();
    await page.waitForFunction(
      () => !document.querySelector("#start-check").disabled,
    );
    assert.equal(uploads.length, 1);
    assert.equal(
      await page.locator("#batch-progress").evaluate((node) => node.value),
      1,
    );
    let releaseSecond;
    gate = new Promise((resolve) => (releaseSecond = resolve));
    await page.locator("#language-toggle").click();
    await page.locator("#start-check").click();
    await wait(() => uploads.length === 2);
    await page.locator('[data-view="transactions"]:visible').click();
    releaseSecond();
    await wait(() => uploads.length === 8);
    await page.waitForFunction(
      () => document.querySelector("#batch-progress").value === 8,
    );
    assert.equal(await page.locator("#transactions-view").isVisible(), true);
    await page.locator('[data-view="review"]:visible').click();
    assert.equal(maximumActive, 1);
    assert.equal(await page.locator("#business-date").count(), 0);
    assert.equal(await page.locator("[data-select]").count(), 10);
    await select("duplicate.png");
    await page
      .locator("#result-title")
      .filter({ hasText: "This image was already uploaded" })
      .waitFor();
    assert.equal(
      await page.locator("#review-detail .badge.warning").textContent(),
      "Duplicate",
    );
    assert.equal(await page.locator("#run-ocr").count(), 0);
    await select("missing.png");
    await page
      .locator("#result-title")
      .filter({ hasText: "Not found in Excel" })
      .waitFor();
    assert.equal(
      await page.locator("#review-detail .badge.danger").textContent(),
      "Not found",
    );
    await select("mismatch.jpg");
    await page
      .locator("#result-title")
      .filter({ hasText: "The amount does not match" })
      .waitFor();
    await select("network.png");
    await page.locator("#run-ocr").click();
    await wait(() => networkAttempts === 2);
    await page
      .locator("#result-title")
      .filter({ hasText: "This receipt matches" })
      .waitFor();
    const uploadCount = uploads.length;
    await select("unreadable.png");
    await page.locator("#run-ocr").click();
    await wait(() => rechecks.length === 1);
    await page
      .locator("#result-title")
      .filter({ hasText: "This receipt matches" })
      .waitFor();
    assert.equal(uploads.length, uploadCount);
    assert.equal(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
    );
    await select("good-a.png");
    await page.locator("#receipt-image").waitFor();
    await page
      .getByRole("button", { name: "View full size", exact: true })
      .click();
    await page.locator("#image-dialog").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#image-dialog").isVisible(), false);
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["synthetic image"], "drag-drop.png", { type: "image/png" }),
      );
      const target = document.querySelector("#receipt-drop");
      target.dispatchEvent(
        new DragEvent("dragenter", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      );
    });
    assert.equal(
      await page
        .locator("[data-select]")
        .filter({ hasText: "drag-drop.png" })
        .count(),
      1,
    );
    await page.locator("#start-check").focus();
    await page.keyboard.press("Enter");
    await wait(() => uploads.length === 10);
    await page.waitForFunction(
      () => document.querySelector("#batch-progress").value === 9,
    );
    await page
      .locator("#result-title")
      .filter({ hasText: "This receipt matches" })
      .waitFor();
    assert.equal(
      await page
        .locator("#result-title")
        .evaluate((node) => document.activeElement === node),
      true,
    );
    ocrConfigured = false;
    await page.locator("#receipt-file").setInputFiles(file("local-setup.png"));
    await page.locator("#start-check").click();
    await page
      .locator("#result-title")
      .filter({ hasText: "Receipt reading is unavailable" })
      .waitFor();
    await page.locator("#ocr-warning").waitFor({ state: "visible" });
    assert.match(
      await page.locator(".result-reason").textContent(),
      /Local language models are missing/,
    );
    ocrConfigured = true;
    await page.locator("#run-ocr").click();
    await page
      .locator("#result-title")
      .filter({ hasText: "This receipt matches" })
      .waitFor();
    await page.locator("#ocr-warning").waitFor({ state: "hidden" });
    await select("good-a.png");
    await page.locator("#receipt-image").waitFor();
    for (const locale of ["en", "my"]) {
      if ((await page.locator("html").getAttribute("lang")) !== locale)
        await page.locator("#language-toggle").click();
      for (const [width, height] of [
        [1440, 900],
        [1280, 720],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          return document.fonts.ready;
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${locale} ${width}: overflow`,
        );
        const tooSmall = await page
          .locator("button:visible")
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.getBoundingClientRect().height < 43.5)
              .map((node) => ({
                text: node.textContent,
                height: node.getBoundingClientRect().height,
              })),
          );
        assert.deepEqual(tooSmall, [], `${locale} ${width}: button sizes`);
        const contrast = await page.evaluate(() => {
          const linear = (value) => {
            value /= 255;
            return value <= 0.04045
              ? value / 12.92
              : Math.pow((value + 0.055) / 1.055, 2.4);
          };
          const luminance = (color) => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d");
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const values = [...context.getImageData(0, 0, 1, 1).data]
              .slice(0, 3)
              .map(linear);
            return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
          };
          return [
            ".page-heading p",
            ".drop-copy h3",
            ".result-reason",
            ".nav-link.active",
            ".badge.success",
          ].map((selector) => {
            const node = document.querySelector(selector);
            let parent = node,
              background = "rgb(255,255,255)";
            while (parent) {
              const color = getComputedStyle(parent).backgroundColor;
              if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
                background = color;
                break;
              }
              parent = parent.parentElement;
            }
            const a = luminance(getComputedStyle(node).color),
              b = luminance(background);
            return {
              selector,
              ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            };
          });
        });
        assert.ok(
          contrast.every((item) => item.ratio >= 4.5),
          JSON.stringify(contrast),
        );
        await page.screenshot({
          path: path.join(screenshots, `${locale}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    if ((await page.locator("html").getAttribute("lang")) !== "en")
      await page.locator("#language-toggle").click();
    await page.locator('[data-source="saved"]').click();
    await page.locator("#business-date").fill("2026-10-27");
    await page.locator('[data-filter="DUPLICATE"]').click();
    await page.locator("#receipt-list [data-select]").first().waitFor();
    assert.equal(await page.locator("#receipt-list [data-select]").count(), 1);
    await page.locator('[data-filter="ALL"]').click();
    await page.locator('[data-view="transactions"]:visible').click();
    await page.locator("#history-search").fill(" KBZ100002 ");
    await page.locator("#history-search-form button").click();
    await wait(() => walletRequests.includes("KBZ100002"));
    await page.locator("#transactions-table").getByText("KBZ100002").waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(screenshots, `wallet-en-${width}.png`),
        fullPage: true,
      });
    }
    await page.locator('[data-view="imports"]:visible').click();
    await page.locator('[data-errors="import-demo"]').click();
    await page
      .locator("#import-errors")
      .getByText("Synthetic invalid amount row")
      .waitFor();
    await page.locator('[data-page="imports-next"]').click();
    await page
      .locator("#imports-table")
      .getByText("Statement-50.xlsx")
      .waitFor();
    assert.equal(
      await page.locator("#imports-page").textContent(),
      "Page 2 of 2",
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(screenshots, `imports-en-${width}.png`),
        fullPage: true,
      });
    }
    expireSession = true;
    await page.locator('[data-view="review"]:visible').click();
    await page.locator("#refresh").click();
    await page.locator("#login-view").waitFor();
    await page
      .getByRole("alert")
      .filter({ hasText: "Your session ended" })
      .waitFor();
    expireSession = false;
    await page.locator("#login-email").fill("reviewer@example.test");
    await page.locator("#login-password").fill("synthetic-password");
    await page.locator("#login-submit").click();
    await page.locator("#workspace").waitFor();
    assert.equal(await page.locator("#receipt-file").count(), 0);
    assert.equal(await page.locator("#open-import").count(), 0);
    assert.equal(
      await page.locator('[data-source="saved"]').getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#receipt-list [data-select]").first().waitFor();
    assert.equal(
      await page.locator("#receipt-list").getByText("good-a.png").count(),
      0,
    );
    await page.locator("#logout").click();
    await page.locator("#login-view").waitFor();
    await page.locator("#language-toggle").click();
    await page.reload();
    await page.locator("#login-view").waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "my");
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log(
      JSON.stringify({
        passed: true,
        locales: 2,
        viewports: 3,
        sequentialUploads: uploads.length,
        maximumActive,
        checks: [
          "form validation and import cache invalidation",
          "saved filters, wallet search, import pagination and row errors",
          "session expiry, logout and reviewer restrictions",
          "single and batch selection",
          "drag and drop",
          "invalid/empty/oversized files",
          "remove pending",
          "pause/resume",
          "language switch during upload",
          "navigation during upload",
          "mixed receipt dates",
          "image/payment duplicates",
          "missing/mismatched payments",
          "network retry",
          "OCR retry without upload",
          "leave warning",
          "image dialog",
          "keyboard and result focus",
          "language persistence",
          "44px controls",
          "sample text contrast >=4.5",
          "no horizontal overflow",
        ],
        pageErrors: errors,
      }),
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
