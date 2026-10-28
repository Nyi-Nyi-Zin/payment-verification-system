const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdtemp, rm, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve, relative, isAbsolute } = require("node:path");
const { spawn } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
const XLSX = require("xlsx");
// Only this run's unique schema and temporary objects are created or removed.
const database = process.env.TEST_DATABASE_URL;
test(
  "HTTP: Excel import -> automatic OCR comparison -> atomic duplicate detection",
  { skip: !database, timeout: 180000 },
  async (t) => {
    const schema = `mvp_test_${randomUUID().replace(/-/g, "")}`;
    const url = new URL(database);
    url.searchParams.set("schema", schema);
    Object.assign(process.env, {
      DATABASE_URL: url.toString(),
      JWT_SECRET: "test-access-secret-".repeat(4),
      JWT_REFRESH_SECRET: "test-refresh-secret-".repeat(4),
      GOOGLE_VISION_API_KEY: "test-adapter-only",
      OCR_DRIVER: "google-vision", // Explicit injected cloud adapter; never a real cloud request.
      STORAGE_DRIVER: "local",
    });
    const storage = await mkdtemp(join(tmpdir(), "payment-auto-test-"));
    process.env.STORAGE_LOCAL_DIR = storage;
    const root = new PrismaClient({ datasources: { db: { url: database } } });
    let app,
      prisma,
      tokens,
      config,
      ocrCalls = 0;
    try {
      await new Promise((done, reject) => {
        const child = spawn(
          process.execPath,
          [
            resolve(__dirname, "../node_modules/prisma/build/index.js"),
            "migrate",
            "deploy",
          ],
          { cwd: resolve(__dirname, ".."), env: process.env, stdio: "pipe" },
        );
        let output = "";
        child.stdout.on("data", (chunk) => (output += chunk));
        child.stderr.on("data", (chunk) => (output += chunk));
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0 ? done() : reject(new Error(output)),
        );
      });
      const synthetic = await readFile(
        join(__dirname, "fixtures/kbzpay-synthetic.png"),
      );
      const { Test } = require("@nestjs/testing");
      const { AppModule } = require("../dist/app.module");
      const { configureApp } = require("../dist/configure-app");
      const { PrismaService } = require("../dist/database.prisma");
      const {
        GoogleVisionOcrEngine,
        OcrServiceError,
      } = require("../dist/ocr/ocr.engine");
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(GoogleVisionOcrEngine)
        .useValue({
          extractText: async (image) => {
            ocrCalls++;
            const fixture = JSON.parse(
              image.subarray(synthetic.length).toString(),
            );
            if (fixture.fail) throw new Error("Injected OCR outage");
            if (fixture.reasonCode)
              throw new OcrServiceError(fixture.reasonCode);
            return {
              text: fixture.text,
              engine: "test-adapter",
              engineVersion: "1",
            };
          },
        })
        .compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.listen(0, "127.0.0.1");
      const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      // The fixture server uses an ephemeral origin; allow only that exact origin.
      module
        .get(require("../dist/auth/browser-auth").BrowserAuth)
        .origins.add(base);
      prisma = module.get(PrismaService);
      config = module.get(require("@nestjs/config").ConfigService);
      const password = "Automatic-test-password";
      const user = await prisma.user.create({
        data: {
          role: "ADMIN",
          displayName: "Test Admin",
          emailOrPhone: "test-admin@example.com",
          passwordHash: await hash(password, 4),
        },
      });
      await prisma.user.create({
        data: {
          role: "OPERATOR",
          displayName: "Test Operator",
          emailOrPhone: "operator@example.com",
          passwordHash: await hash(password, 4),
        },
      });
      const call = async (path, options = {}, token = tokens?.accessToken) => {
        const headers = {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        if (options.body && !(options.body instanceof FormData))
          headers["Content-Type"] = "application/json";
        const response = await fetch(`${base}/api/v1${path}`, {
          ...options,
          headers,
        });
        return {
          status: response.status,
          data: await response.json().catch(() => ({})),
        };
      };
      const upload = (bytes, name, scope) => {
        const form = new FormData();
        form.set("provider", "KBZPAY");
        form.set("businessDate", "2026-10-28");
        if (scope) form.set("scope", scope);
        form.set("file", new Blob([bytes]), name);
        return form;
      };
      const row = (
        id,
        amount,
        date = "27-10-2026",
        time = "10:30:00",
        outgoing = false,
      ) => [
        `${date} ${time}`,
        id,
        "Transfer",
        outgoing ? "0" : amount,
        outgoing ? `-${amount}` : "0",
        "100000",
        "",
      ];
      const workbook = (rows) => {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.aoa_to_sheet([
            [
              "Transaction Date & Time",
              "TM Ref No",
              "Detailed Description",
              "Credit",
              "Debit",
              "Balance",
              "Notes",
            ],
            ...rows,
          ]),
          "History",
        );
        return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
      };
      const importFile = (rows, scope = "statement") =>
        call("/imports", {
          method: "POST",
          body: upload(workbook(rows), "history.xlsx", scope),
        });
      const text = (
        id = "AUTO100001",
        amount = "10000",
        date = "2026-10-27",
        time = "10:30 AM",
      ) =>
        `KBZPay\nTransfer Successful\n${id ? `Transaction ID: ${id}\n` : ""}Amount: ${amount} MMK\n${date ? `Date: ${date}\n` : ""}Time: ${time}\nReceiver Name: Test Shop`;
      let receiptCounter = 0;
      const receiptBytes = (ocrText, extra = {}) =>
        Buffer.concat([
          synthetic,
          Buffer.from(
            JSON.stringify({
              text: ocrText,
              nonce: ++receiptCounter,
              ...extra,
            }),
          ),
        ]);
      const receipt = (ocrText, extra) =>
        call("/screenshots", {
          method: "POST",
          body: upload(receiptBytes(ocrText, extra), "receipt.png"),
        });
      const processReceipt = (id) =>
        call(`/verification/screenshots/${id}/process`, { method: "POST" });
      let first, failedReceipt;
      await t.test("serves UI, protects APIs and signs in", async () => {
        const ui = await fetch(base);
        assert.equal(ui.status, 200);
        const policy = ui.headers.get("content-security-policy");
        assert.match(policy, /'sha256-/);
        assert.equal(policy.includes("unsafe-inline"), false);
        assert.match(await ui.text(), /id="session-loading"/);
        assert.equal((await fetch(`${base}/app.js`)).status, 404);
        const unknownApi = await fetch(`${base}/api/v1/does-not-exist`);
        assert.equal(unknownApi.status, 404);
        assert.match(
          unknownApi.headers.get("content-type"),
          /application\/json/,
        );
        assert.equal(
          (await call("/dashboard?date=2026-10-27", {}, null)).status,
          401,
        );
        const login = await call(
          "/auth/login",
          {
            method: "POST",
            body: JSON.stringify({ emailOrPhone: user.emailOrPhone, password }),
          },
          null,
        );
        assert.equal(login.status, 201);
        tokens = login.data;
      });
      await t.test(
        "upgrades partial statement imports and preserves each transaction date",
        async () => {
          const rows = [
            row("AUTO100001", "10000"),
            row("AUTO100002", "20000", "26-10-2026"),
          ];
          const day = upload(workbook(rows), "history.xlsx");
          day.set("businessDate", "2026-10-27");
          const partial = await call("/imports", { method: "POST", body: day });
          assert.equal(partial.data.parsedRows, 1);
          assert.equal(partial.data.errorRows, 1);
          const complete = await importFile(rows);
          assert.equal(complete.status, 201, JSON.stringify(complete));
          assert.equal(complete.data.parsedRows, 1);
          assert.equal(complete.data.skippedRows, 1);
          assert.equal(complete.data.errorRows, 0);
          assert.equal(complete.data.importId, partial.data.importId);
          assert.equal(
            (await call("/transactions?date=2026-10-26")).data.total,
            1,
          );
          assert.equal((await importFile(rows)).data.duplicate, true);
          assert.equal(await prisma.paymentImportError.count(), 0);
          assert.equal(await prisma.paymentTransaction.count(), 2);
        },
      );
      await t.test(
        "QuickPay payment and fee share a reference without blocking the statement",
        async () => {
          const payment = row(
            "QUICKPAY001",
            "60900",
            "28-09-2026",
            "14:05:53",
            true,
          );
          payment[2] = "OnlinePayment for QuickPay";
          const fee = row("QUICKPAY001", "500", "28-09-2026", "14:05:53", true);
          fee[2] = "QuickPay Fee Charge from 959*********";
          const imported = await importFile([fee, payment]);
          assert.equal(imported.status, 201, JSON.stringify(imported));
          assert.equal(imported.data.parsedRows, 1);
          assert.equal(imported.data.errorRows, 0);
          const stored = await prisma.paymentTransaction.findMany({
            where: { externalTransactionId: "QUICKPAY001" },
          });
          assert.equal(stored.length, 1);
          assert.equal(stored[0].amount.toFixed(2), "60900.00");
          assert.equal(stored[0].direction, "OUTGOING");
          const overlapping = await importFile([payment, fee]);
          assert.equal(overlapping.status, 201);
          assert.equal(overlapping.data.parsedRows, 0);
          assert.equal(overlapping.data.skippedRows, 1);
          const conflicting = await importFile([
            row("REALCONFLICT001", "1000"),
            row("REALCONFLICT001", "2000"),
          ]);
          assert.equal(conflicting.status, 400);
          assert.equal(
            await prisma.paymentTransaction.count({
              where: { externalTransactionId: "REALCONFLICT001" },
            }),
            0,
          );
        },
      );
      await t.test(
        "conflicting exports roll back; image bytes are validated",
        async () => {
          assert.equal(
            (
              await importFile([
                row("NEW999999", "500"),
                row("AUTO100001", "99999"),
              ])
            ).status,
            400,
          );
          assert.equal(
            await prisma.paymentTransaction.count({
              where: { externalTransactionId: "NEW999999" },
            }),
            0,
          );
          assert.equal(
            (
              await call("/screenshots", {
                method: "POST",
                body: upload(Buffer.from("<script>bad</script>"), "bad.png"),
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "upload automatically matches and reserves without manual approval",
        async () => {
          const result = await receipt(text());
          assert.equal(result.status, 201, JSON.stringify(result));
          assert.equal(result.data.status, "VERIFIED");
          assert.equal(result.data.reasonCode, "EXACT_TRANSACTION_ID");
          assert.equal(result.data.businessDate, "2026-10-27");
          first = result.data.screenshotId;
          assert.equal(await prisma.usedTransaction.count(), 1);
          const detail = (await call(`/screenshots/${first}`)).data;
          assert.equal(detail.verificationResults[0].reviewedById, null);
          assert.ok(detail.verificationResults[0].verifiedAt);
          assert.equal(
            (await fetch(`${base}/api/v1/screenshots/${first}/image`)).status,
            401,
          );
          assert.equal(
            (
              await fetch(`${base}/api/v1/screenshots/${first}/image`, {
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
              })
            ).status,
            200,
          );
        },
      );
      await t.test(
        "detects identical files and different images claiming the same payment",
        async () => {
          const same = await receipt(text());
          assert.equal(same.data.status, "DUPLICATE");
          assert.equal(same.data.reasonCode, "TRANSACTION_ALREADY_USED");
          const bytes = receiptBytes(text());
          const one = await call("/screenshots", {
            method: "POST",
            body: upload(bytes, "one.png"),
          });
          const count = ocrCalls;
          const two = await call("/screenshots", {
            method: "POST",
            body: upload(bytes, "renamed.png"),
          });
          assert.equal(two.data.duplicate, false);
          assert.equal(two.data.status, "DUPLICATE");
          assert.equal(two.data.reasonCode, "TRANSACTION_ALREADY_USED");
          assert.equal(two.data.screenshotId, one.data.screenshotId);
          assert.equal(ocrCalls, count + 1);
          assert.equal(await prisma.usedTransaction.count(), 1);
        },
      );
      await t.test(
        "missing transaction IDs and different amounts never fall back to amount/time",
        async () => {
          const id = await receipt(text("WRONG99999"));
          assert.equal(id.data.status, "UNMATCHED");
          assert.equal(id.data.reasonCode, "TRANSACTION_ID_NOT_FOUND");
          const amount = await receipt(text("AUTO100001", "99999"));
          assert.equal(amount.data.status, "UNMATCHED");
          assert.equal(
            amount.data.reasonCode,
            "TRANSACTION_ID_AMOUNT_MISMATCH",
          );
          assert.equal(
            (await receipt(text("AUTO100001", "10000", "2026-10-25"))).data
              .status,
            "UNMATCHED",
          );
        },
      );
      await t.test(
        "equal amounts for different receipt transaction IDs both match their own Excel records",
        async () => {
          await importFile([
            row("SEPARATE001", "12345"),
            row("SEPARATE002", "12345"),
          ]);
          const one = await receipt(text("SEPARATE001", "12345"));
          const two = await receipt(text("SEPARATE002", "12345"));
          assert.equal(one.data.status, "VERIFIED");
          assert.equal(two.data.status, "VERIFIED");
          assert.notEqual(one.data.candidateId, two.data.candidateId);
        },
      );
      await t.test(
        "OCR unavailable, failed and missing fields are separate from no match",
        async () => {
          config.set("ocr.googleVisionApiKey", "");
          const unavailable = await receipt(
            text("AUTO100002", "20000", "2026-10-26"),
          );
          assert.equal(unavailable.data.status, "FAILED");
          assert.equal(unavailable.data.reasonCode, "OCR_NOT_CONFIGURED");
          failedReceipt = unavailable.data.screenshotId;
          assert.equal(
            (await call("/dashboard?date=2026-10-28")).data.ocrConfigured,
            false,
          );
          config.set("ocr.googleVisionApiKey", "test-adapter-only");
          assert.equal(
            (await receipt(text(), { fail: true })).data.reasonCode,
            "OCR_FAILED",
          );
          const missing = await receipt(text("AUTO100001", "10000", ""));
          assert.equal(missing.data.status, "FAILED");
          assert.equal(missing.data.reasonCode, "OCR_FIELDS_INCOMPLETE");
          const retry = await processReceipt(failedReceipt);
          assert.equal(retry.data.status, "VERIFIED");
          assert.equal(retry.data.businessDate, "2026-10-26");
        },
      );
      await t.test(
        "billing failures persist a setup diagnosis and never become no-match results",
        async () => {
          const count = await prisma.usedTransaction.count();
          const result = await receipt(text(), {
            reasonCode: "OCR_BILLING_DISABLED",
          });
          assert.equal(result.data.status, "FAILED");
          assert.equal(result.data.reasonCode, "OCR_BILLING_DISABLED");
          const detail = (
            await call(`/screenshots/${result.data.screenshotId}`)
          ).data;
          assert.equal(detail.lastError, "OCR_BILLING_DISABLED");
          assert.equal(
            detail.verificationResults[0].reasonCode,
            "OCR_BILLING_DISABLED",
          );
          assert.equal(await prisma.usedTransaction.count(), count);
        },
      );
      await t.test(
        "Myanmar E-Receipt text matches a numeric reference and payer debit amount",
        async () => {
          await importFile([
            row("01000000000000000001", "1", "28-10-2026", "01:09:51"),
          ]);
          const result = await receipt(
            "KBZPay\nE-Receipt\n-1.00 Ks\n28/10/2026 01:09:51\nလုပ်ဆောင်မှုအမှတ်\n01000000000000000001",
          );
          assert.equal(result.data.status, "VERIFIED");
          assert.equal(result.data.reasonCode, "EXACT_TRANSACTION_ID");
        },
      );
      await t.test(
        "amount/time requires one candidate and outgoing rows cannot match",
        async () => {
          await importFile([
            row("UNIQUE0001", "33000"),
            row("AMBIG00001", "44000"),
            row("AMBIG00002", "44000"),
            row("OUTGOING01", "55000", "27-10-2026", "10:30:00", true),
          ]);
          assert.equal(
            (await receipt(text("", "33000"))).data.status,
            "VERIFIED",
          );
          const ambiguous = await receipt(text("", "44000"));
          assert.equal(ambiguous.data.status, "UNMATCHED");
          assert.equal(
            ambiguous.data.reasonCode,
            "MULTIPLE_LEVEL_TWO_CANDIDATES",
          );
          assert.equal(
            (await receipt(text("OUTGOING01", "55000"))).data.status,
            "UNMATCHED",
          );
        },
      );
      await t.test(
        "simultaneous uploads produce one match and one duplicate",
        async () => {
          await importFile([row("CONCURRENT1", "66000")]);
          const results = await Promise.all([
            receipt(text("CONCURRENT1", "66000")),
            receipt(text("CONCURRENT1", "66000")),
          ]);
          assert.deepEqual(
            results.map((r) => r.status),
            [201, 201],
          );
          assert.deepEqual(results.map((r) => r.data.status).sort(), [
            "DUPLICATE",
            "VERIFIED",
          ]);
          const transaction = await prisma.paymentTransaction.findFirst({
            where: { externalTransactionId: "CONCURRENT1" },
          });
          assert.equal(
            await prisma.usedTransaction.count({
              where: { transactionId: transaction.id },
            }),
            1,
          );
        },
      );
      await t.test(
        "no match can be retried after importing history; matches are terminal",
        async () => {
          const missing = await receipt(text("LATER00001", "77000"));
          assert.equal(missing.data.status, "UNMATCHED");
          await importFile([row("LATER00001", "77000")]);
          assert.equal(
            (await processReceipt(missing.data.screenshotId)).data.status,
            "VERIFIED",
          );
          assert.equal((await processReceipt(first)).status, 409);
        },
      );
      await t.test(
        "filters, dashboard and audit trail report automatic outcomes",
        async () => {
          const list = (
            await call("/screenshots?date=2026-10-27&status=DUPLICATE")
          ).data;
          assert.ok(list.total >= 3);
          assert.ok(list.items.every((r) => r.status === "DUPLICATE"));
          const dashboard = (await call("/dashboard?date=2026-10-27")).data;
          assert.equal(dashboard.mode, "AUTOMATIC_COMPARISON");
          assert.ok(dashboard.receipts.VERIFIED >= 4);
          assert.equal(
            await prisma.auditLog.count({ where: { action: "AUTO_VERIFIED" } }),
            await prisma.usedTransaction.count(),
          );
          assert.equal(
            await prisma.auditLog.count({ where: { action: "APPROVE" } }),
            0,
          );
        },
      );
      await t.test(
        "operator uploads do not require reviewer privileges",
        async () => {
          const login = await call(
            "/auth/login",
            {
              method: "POST",
              body: JSON.stringify({
                emailOrPhone: "operator@example.com",
                password,
              }),
            },
            null,
          );
          assert.equal(login.status, 201);
          const result = await call(
            "/screenshots",
            {
              method: "POST",
              body: upload(receiptBytes(text("WRONG99999")), "operator.png"),
            },
            login.data.accessToken,
          );
          assert.equal(result.data.status, "UNMATCHED");
          assert.equal(
            (
              await call(
                `/reviews/${first}/resolve`,
                {
                  method: "PATCH",
                  body: JSON.stringify({ action: "APPROVE", confirmed: true }),
                },
                login.data.accessToken,
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "refresh rotation and inactive user protection remain enforced",
        async () => {
          const old = tokens.refreshToken;
          const refreshed = await call(
            "/auth/refresh",
            { method: "POST", body: JSON.stringify({ refreshToken: old }) },
            null,
          );
          assert.equal(refreshed.status, 201);
          assert.equal(
            (
              await call(
                "/auth/refresh",
                { method: "POST", body: JSON.stringify({ refreshToken: old }) },
                null,
              )
            ).status,
            401,
          );
          tokens = refreshed.data;
          await prisma.user.update({
            where: { id: user.id },
            data: { status: "INACTIVE" },
          });
          assert.equal((await call("/dashboard?date=2026-10-27")).status, 401);
          await prisma.user.update({
            where: { id: user.id },
            data: { status: "ACTIVE" },
          });
        },
      );
      await t.test(
        "deletion releases only its own payment and duplicates can be checked again",
        async () => {
          const objectStore = module.get(
            require("../dist/storage/s3.storage").S3Storage,
          );
          const imported = await importFile([
            row("DELETE10001", "68000"),
            row("DELETEUNUSED", "69000"),
          ]);
          assert.equal(imported.status, 201);
          const importId = imported.data.importId;
          const importRecord = await prisma.paymentImport.findUnique({
            where: { id: importId },
          });
          const checked = await receipt(text("DELETE10001", "68000"));
          assert.equal(checked.data.status, "VERIFIED");
          const id = checked.data.screenshotId;
          const blockedBytes = receiptBytes(text("DELETE10001", "68000"));
          const blocked = await call("/screenshots", {
            method: "POST",
            body: upload(blockedBytes, "blocked.png"),
          });
          assert.equal(blocked.data.status, "DUPLICATE");
          assert.equal(
            (await processReceipt(blocked.data.screenshotId)).data.status,
            "DUPLICATE",
          );
          const disposable = await receipt(text("DELETE10001", "68000"));
          assert.equal(disposable.data.status, "DUPLICATE");
          await call(`/screenshots/${disposable.data.screenshotId}`, {
            method: "DELETE",
          });
          assert.equal(
            (await processReceipt(blocked.data.screenshotId)).data.status,
            "DUPLICATE",
          );
          const record = await prisma.paymentScreenshot.findUnique({
            where: { id },
          });
          const shared = await prisma.paymentScreenshot.create({
            data: {
              source: "WEB",
              businessDate: record.businessDate,
              storageKey: record.storageKey,
              fileHash: record.fileHash,
              mimeType: record.mimeType,
              fileSizeBytes: record.fileSizeBytes,
              submittedProvider: "KBZPAY",
              status: "UNMATCHED",
            },
          });
          assert.equal(
            (await call(`/screenshots/${id}`, { method: "DELETE" }, null))
              .status,
            401,
          );
          const reviewer = await prisma.user.create({
            data: {
              role: "REVIEWER",
              displayName: "Delete Reviewer",
              emailOrPhone: "delete-reviewer@example.test",
              passwordHash: await hash(password, 4),
            },
          });
          const reviewerLogin = await call(
            "/auth/login",
            {
              method: "POST",
              body: JSON.stringify({
                emailOrPhone: reviewer.emailOrPhone,
                password,
              }),
            },
            null,
          );
          for (const path of [`/screenshots/${id}`, `/imports/${importId}`])
            assert.equal(
              (
                await call(
                  path,
                  { method: "DELETE" },
                  reviewerLogin.data.accessToken,
                )
              ).status,
              403,
            );
          await prisma.paymentScreenshot.update({
            where: { id },
            data: { status: "PROCESSING" },
          });
          for (const path of [`/screenshots/${id}`, `/imports/${importId}`]) {
            const blocked = await call(path, { method: "DELETE" });
            assert.equal(blocked.status, 409);
            assert.equal(blocked.data.code, "UPLOAD_BUSY");
          }
          await prisma.paymentScreenshot.update({
            where: { id },
            data: { status: "VERIFIED" },
          });
          assert.equal(
            (await call(`/screenshots/${id}`, { method: "DELETE" })).status,
            200,
          );
          assert.equal((await call(`/screenshots/${id}`)).status, 404);
          assert.equal(
            (
              await fetch(`${base}/api/v1/screenshots/${id}/image`, {
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
              })
            ).status,
            404,
          );
          assert.equal(
            await prisma.ocrResult.count({ where: { screenshotId: id } }),
            0,
          );
          assert.equal(
            await prisma.verificationResult.count({
              where: { screenshotId: id },
            }),
            0,
          );
          const transaction = await prisma.paymentTransaction.findUnique({
            where: {
              provider_externalTransactionId: {
                provider: "KBZPAY",
                externalTransactionId: "DELETE10001",
              },
            },
          });
          assert.equal(
            await prisma.usedTransaction.findUnique({
              where: { transactionId: transaction.id },
            }),
            null,
          );
          const revived = await call("/screenshots", {
            method: "POST",
            body: upload(blockedBytes, "blocked.png"),
          });
          assert.equal(revived.data.screenshotId, blocked.data.screenshotId);
          assert.equal(revived.data.status, "VERIFIED");
          assert.equal(revived.data.duplicate, false);
          assert.equal(
            (await processReceipt(blocked.data.screenshotId)).status,
            409,
          );
          assert.ok(
            (await objectStore.getObject(record.storageKey)).length,
            "Shared object must survive until its last upload is deleted",
          );
          const deleteObject = objectStore.deleteObject.bind(objectStore);
          objectStore.deleteObject = async () => {
            throw new Error("Injected storage delete outage");
          };
          try {
            assert.equal(
              (await call(`/screenshots/${shared.id}`, { method: "DELETE" }))
                .status,
              500,
            );
            assert.ok(
              await prisma.paymentScreenshot.findUnique({
                where: { id: shared.id },
              }),
            );
          } finally {
            objectStore.deleteObject = deleteObject;
          }
          assert.equal(
            (await call(`/screenshots/${shared.id}`, { method: "DELETE" }))
              .status,
            200,
          );
          await assert.rejects(objectStore.getObject(record.storageKey));
          assert.equal(
            (await call(`/screenshots/${id}`, { method: "DELETE" })).data
              .deleted,
            false,
          );
          assert.equal(
            (await receipt(text("DELETE10001", "68000"))).data.status,
            "DUPLICATE",
          );
          const removedImport = await call(`/imports/${importId}`, {
            method: "DELETE",
          });
          assert.equal(removedImport.status, 200);
          assert.equal(removedImport.data.deletedTransactions, 1);
          assert.equal(removedImport.data.retainedTransactions, 1);
          assert.equal(
            await prisma.paymentImport.findUnique({ where: { id: importId } }),
            null,
          );
          await assert.rejects(objectStore.getObject(importRecord.storageKey));
          assert.equal(
            (
              await prisma.paymentTransaction.findUnique({
                where: { id: transaction.id },
              })
            ).sourceImportId,
            null,
          );
          assert.equal(
            (await receipt(text("DELETE10001", "68000"))).data.status,
            "DUPLICATE",
          );
          assert.equal(
            (await call(`/imports/${importId}`, { method: "DELETE" })).data
              .deleted,
            false,
          );
          assert.ok(
            await prisma.auditLog.findFirst({
              where: { action: "SCREENSHOT_DELETED", entityId: id },
            }),
          );
          assert.ok(
            await prisma.auditLog.findFirst({
              where: { action: "IMPORT_DELETED", entityId: importId },
            }),
          );
          const reimport = await importFile([
            row("DELETE10001", "68000"),
            row("DELETEUNUSED", "69000"),
          ]);
          assert.equal(reimport.data.duplicate, false);
          assert.equal(reimport.data.parsedRows, 1);
          assert.equal(reimport.data.skippedRows, 1);
        },
      );
      await t.test(
        "rechecking concurrent duplicates after deletion admits exactly one receipt",
        async () => {
          await importFile([row("RELEASE-RACE", "71500")]);
          const original = await receipt(text("RELEASE-RACE", "71500"));
          const others = await Promise.all([
            receipt(text("RELEASE-RACE", "71500")),
            receipt(text("RELEASE-RACE", "71500")),
          ]);
          assert.ok(others.every((r) => r.data.status === "DUPLICATE"));
          await call(`/screenshots/${original.data.screenshotId}`, {
            method: "DELETE",
          });
          const retried = await Promise.all(
            others.map((r) => processReceipt(r.data.screenshotId)),
          );
          assert.deepEqual(retried.map((r) => r.data.status).sort(), [
            "DUPLICATE",
            "VERIFIED",
          ]);
        },
      );
      await t.test(
        "failed deletion rolls back the payment release",
        async () => {
          await importFile([row("RELEASE-ROLLBACK", "72500")]);
          const original = await receipt(text("RELEASE-ROLLBACK", "72500"));
          const id = original.data.screenshotId;
          const objectStore = module.get(
            require("../dist/storage/s3.storage").S3Storage,
          );
          const deleteObject = objectStore.deleteObject.bind(objectStore);
          objectStore.deleteObject = async () => {
            throw new Error("Injected deletion failure");
          };
          try {
            assert.equal(
              (await call(`/screenshots/${id}`, { method: "DELETE" })).status,
              500,
            );
            assert.ok(
              await prisma.usedTransaction.findUnique({
                where: { screenshotId: id },
              }),
            );
            assert.equal(
              (await receipt(text("RELEASE-ROLLBACK", "72500"))).data.status,
              "DUPLICATE",
            );
          } finally {
            objectStore.deleteObject = deleteObject;
          }
        },
      );
      await t.test(
        "migration releases legacy orphan claims and preserves saved receipt claims",
        async () => {
          await importFile([
            row("LEGACY-DELETED", "73500"),
            row("LEGACY-SAVED", "74500"),
          ]);
          const deleted = await receipt(text("LEGACY-DELETED", "73500"));
          const saved = await receipt(text("LEGACY-SAVED", "74500"));
          const migration = await readFile(
            join(
              __dirname,
              "../prisma/migrations/202610290004_release_deleted_receipt_claims/migration.sql",
            ),
            "utf8",
          );
          await prisma.$transaction(async (tx) => {
            // Reproduce the preceding migration's nullable, SET NULL relationship.
            await tx.$executeRawUnsafe(
              'ALTER TABLE "UsedTransaction" DROP CONSTRAINT "UsedTransaction_screenshotId_fkey"',
            );
            await tx.$executeRawUnsafe(
              'ALTER TABLE "UsedTransaction" ALTER COLUMN "screenshotId" DROP NOT NULL',
            );
            await tx.$executeRawUnsafe(
              'ALTER TABLE "UsedTransaction" ADD CONSTRAINT "UsedTransaction_screenshotId_fkey" FOREIGN KEY ("screenshotId") REFERENCES "PaymentScreenshot"("id") ON DELETE SET NULL ON UPDATE CASCADE',
            );
            await tx.verificationResult.deleteMany({
              where: { screenshotId: deleted.data.screenshotId },
            });
            await tx.paymentScreenshot.delete({
              where: { id: deleted.data.screenshotId },
            });
            const [legacy] = await tx.$queryRawUnsafe(
              'SELECT COUNT(*)::int AS count FROM "UsedTransaction" WHERE "screenshotId" IS NULL',
            );
            assert.equal(legacy.count, 1);
            for (const sql of migration
              .replace(/^--.*$/gm, "")
              .split(";")
              .map((s) => s.trim())
              .filter(Boolean))
              await tx.$executeRawUnsafe(sql);
            const [{ count }] = await tx.$queryRawUnsafe(
              'SELECT COUNT(*)::int AS count FROM "UsedTransaction" WHERE "screenshotId" IS NULL',
            );
            assert.equal(count, 0);
            assert.ok(
              await tx.usedTransaction.findUnique({
                where: { screenshotId: saved.data.screenshotId },
              }),
            );
          });
          assert.equal(
            (await receipt(text("LEGACY-DELETED", "73500"))).data.status,
            "VERIFIED",
          );
          assert.equal(
            (await receipt(text("LEGACY-SAVED", "74500"))).data.status,
            "DUPLICATE",
          );
        },
      );
      if (process.env.MVP_BROWSER_TEST === "1") {
        await t.test("desktop and mobile automatic comparison", async () => {
          await require("../scripts/browser-smoke.cjs")({
            base,
            email: user.emailOrPhone,
            password,
            receiptId: first,
            image: receiptBytes(text("BROWSER001", "88000")),
            noMatchImage: receiptBytes(text("BROWSERNONE", "99000")),
            billingImage: receiptBytes(text("BILLING001", "1000"), {
              reasonCode: "OCR_BILLING_DISABLED",
            }),
            statement: workbook([row("BROWSER001", "88000")]),
            setOcrAvailable: (enabled) =>
              config.set(
                "ocr.googleVisionApiKey",
                enabled ? "test-adapter-only" : "",
              ),
          });
        });
        await t.test("browser deletes receipt and Excel uploads", async () => {
          await require("../scripts/delete-upload-browser.cjs")({
            base,
            email: user.emailOrPhone,
            password,
            statement: workbook([row("DELETEBROWSER", "79000")]),
            image: receiptBytes(text("DELETEBROWSER", "79000")),
            duplicateImage: receiptBytes(text("DELETEBROWSER", "79000")),
            prisma,
          });
        });
      }
    } finally {
      if (app) await app.close();
      if (prisma) await prisma.$disconnect();
      await root.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await root.$disconnect();
      const withinTemp = relative(resolve(tmpdir()), resolve(storage));
      assert.ok(
        withinTemp && !withinTemp.startsWith("..") && !isAbsolute(withinTemp),
      );
      await rm(storage, { recursive: true, force: true });
    }
  },
);
