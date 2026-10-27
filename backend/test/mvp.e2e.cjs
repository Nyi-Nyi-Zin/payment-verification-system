const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdtemp, rm, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawn } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
const XLSX = require("xlsx");

// Every run creates and drops ONLY its own unique schema. Never truncate a shared database.
const database = process.env.TEST_DATABASE_URL;
test(
  "KBZPay MVP: HTTP → import → OCR/manual review → atomic reservation",
  { skip: !database, timeout: 180000 },
  async (t) => {
    const schema = `mvp_test_${randomUUID().replace(/-/g, "")}`;
    const url = new URL(database);
    url.searchParams.set("schema", schema);
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_SECRET = "test-access-secret-".repeat(4);
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-".repeat(4);
    process.env.GOOGLE_VISION_API_KEY = "test-adapter-only";
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_LOCAL_DIR = await mkdtemp(
      join(tmpdir(), "payment-mvp-"),
    );
    const root = new PrismaClient({ datasources: { db: { url: database } } });
    let app;
    let prisma;
    try {
      const code = await new Promise((done, reject) => {
        const child = spawn("pnpm", ["exec", "prisma", "migrate", "deploy"], {
          cwd: resolve(__dirname, ".."),
          env: process.env,
          stdio: "pipe",
        });
        let output = "";
        child.stdout.on("data", (data) => {
          output += data;
        });
        child.stderr.on("data", (data) => {
          output += data;
        });
        child.on("error", reject);
        child.on("exit", (status) =>
          status === 0 ? done(status) : reject(new Error(output)),
        );
      });
      assert.equal(code, 0);
      const { Test } = require("@nestjs/testing");
      const { AppModule } = require("../dist/app.module");
      const { configureApp } = require("../dist/configure-app");
      const { PrismaService } = require("../dist/database.prisma");
      const { GoogleVisionOcrEngine } = require("../dist/ocr/ocr.engine");
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(GoogleVisionOcrEngine)
        .useValue({
          extractText: async () => ({
            text: "KBZPay\nTransfer Successful\nTransaction ID: KBZ100001\nAmount: 10,000 MMK\nDate: 2026-10-27\nTime: 10:30 AM\nReceiver Name: Cloud Nine",
            engine: "test-adapter",
            engineVersion: "1",
          }),
        })
        .compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address();
      const base = `http://127.0.0.1:${address.port}`;
      prisma = module.get(PrismaService);
      const password = "Mvp-integration-test-password";
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
          emailOrPhone: "test-operator@example.com",
          passwordHash: await hash(password, 4),
        },
      });
      let tokens;
      const call = async (path, options = {}, token = tokens?.accessToken) => {
        const headers = {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        };
        if (options.body && !(options.body instanceof FormData))
          headers["Content-Type"] = "application/json";
        const response = await fetch(`${base}/api/v1${path}`, {
          ...options,
          headers,
        });
        const data = await response.json().catch(() => ({}));
        return { status: response.status, data };
      };
      const json = (body) => JSON.stringify(body);
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
      const upload = (bytes, fileName, type = "application/octet-stream") => {
        const form = new FormData();
        form.set("provider", "KBZPAY");
        form.set("businessDate", "2026-10-27");
        form.set("file", new Blob([bytes], { type }), fileName);
        return form;
      };
      const row = (id, amount, time = "10:30:00") => [
        `27-10-2026 ${time}`,
        id,
        "Received transfer",
        amount,
        "0",
        "100000",
        "",
      ];
      const image = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN7sAAAAASUVORK5CYII=",
        "base64",
      );
      const synthetic = await readFile(
        join(__dirname, "fixtures/kbzpay-synthetic.png"),
      );
      const receipt = async (n) => {
        const r = await call("/screenshots", {
          method: "POST",
          body: upload(
            Buffer.concat([synthetic, Buffer.from(String(n))]),
            `receipt-${n}.png`,
            "image/png",
          ),
        });
        assert.equal(r.status, 201, json(r));
        return r.data.screenshotId;
      };
      let first, second, third, fourth, incoming;
      await t.test(
        "serves the real admin UI and requires authentication",
        async () => {
          const response = await fetch(base);
          assert.equal(response.status, 200);
          assert.match(await response.text(), /Payment Desk/);
          assert.equal(
            (await call("/dashboard?date=2026-10-27", {}, null)).status,
            401,
          );
          assert.equal(
            (
              await call(
                "/auth/login",
                {
                  method: "POST",
                  body: json({
                    emailOrPhone: user.emailOrPhone,
                    password: "incorrect",
                  }),
                },
                null,
              )
            ).status,
            401,
          );
          const result = await call(
            "/auth/login",
            {
              method: "POST",
              body: json({ emailOrPhone: user.emailOrPhone, password }),
            },
            null,
          );
          assert.equal(result.status, 201);
          tokens = result.data;
        },
      );
      await t.test(
        "imports Excel rows, rejects invalid date and deduplicates uploads",
        async () => {
          const file = workbook([
            row("KBZ100001", "10000"),
            row("KBZ100002", "20000", "11:00:00"),
            ["bad row"],
          ]);
          const result = await call("/imports", {
            method: "POST",
            body: upload(file, "history.xlsx"),
          });
          assert.equal(result.status, 201, json(result));
          assert.equal(result.data.parsedRows, 2);
          assert.equal(result.data.errorRows, 1);
          assert.equal(
            (
              await call("/imports", {
                method: "POST",
                body: upload(file, "history.xlsx"),
              })
            ).data.duplicate,
            true,
          );
          const wrongDate = upload(
            workbook([row("BADDATE1", "1000")]),
            "history.xlsx",
          );
          wrongDate.set("businessDate", "2026-10-26");
          assert.equal(
            (await call("/imports", { method: "POST", body: wrongDate }))
              .status,
            400,
          );
          incoming = (await call("/transactions?date=2026-10-27")).data.items;
          assert.equal(incoming.length, 2);
          assert.equal((await call("/imports?date=2026-10-27")).data.total, 1);
        },
      );
      await t.test(
        "rejects conflicting history and unsafe uploads",
        async () => {
          assert.equal(
            (
              await call("/imports", {
                method: "POST",
                body: upload(
                  workbook([row("KBZ100001", "99999")]),
                  "conflict.xlsx",
                ),
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await call("/screenshots", {
                method: "POST",
                body: upload(
                  Buffer.from("<script>bad</script>"),
                  "bad.png",
                  "image/png",
                ),
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "collects receipts, protects image access and deduplicates identical files",
        async () => {
          first = await receipt(1);
          second = await receipt(2);
          third = await receipt(3);
          fourth = await receipt(4);
          const duplicate = await call("/screenshots", {
            method: "POST",
            body: upload(
              Buffer.concat([synthetic, Buffer.from("1")]),
              "again.png",
              "image/png",
            ),
          });
          assert.equal(duplicate.data.screenshotId, first);
          assert.equal(duplicate.data.duplicate, true);
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
        "OCR finds the external provider transaction ID and remains review-only",
        async () => {
          const result = await call(
            `/verification/screenshots/${first}/process`,
            { method: "POST" },
          );
          assert.equal(result.status, 201, json(result));
          assert.equal(result.data.reasonCode, "EXACT_TRANSACTION_ID");
          assert.equal(result.data.status, "PENDING_REVIEW");
          assert.equal(await prisma.usedTransaction.count(), 0);
        },
      );
      await t.test(
        "missing OCR configuration preserves an actionable review item",
        async () => {
          const config = module.get(require("@nestjs/config").ConfigService);
          config.set("ocr.googleVisionApiKey", "");
          const result = await call(
            `/verification/screenshots/${fourth}/process`,
            { method: "POST" },
          );
          assert.equal(result.status, 201);
          assert.equal(result.data.status, "PENDING_REVIEW");
          assert.equal(
            result.data.reasonCode,
            "OCR_NOT_CONFIGURED_ENTER_DETAILS",
          );
          config.set("ocr.googleVisionApiKey", "test-adapter-only");
        },
      );
      const details = (id, reference, amount) =>
        call(`/screenshots/${id}/details`, {
          method: "POST",
          body: json({
            transactionId: reference,
            amount,
            date: "2026-10-27",
            time: "10:30",
          }),
        });
      await t.test(
        "manual fallback finds candidates and rejects mismatched IDs",
        async () => {
          assert.equal(
            (await details(second, "KBZ100001", "10000")).data.reasonCode,
            "EXACT_TRANSACTION_ID",
          );
          assert.equal(
            (await details(third, "WRONGID999", "10000")).data.reasonCode,
            "TRANSACTION_ID_NOT_FOUND",
          );
          assert.equal(
            (await details(third, "KBZ100001", "99999")).data.reasonCode,
            "TRANSACTION_ID_AMOUNT_MISMATCH",
          );
          assert.equal(
            (await details(third, "KBZ100001", "10000")).data.reasonCode,
            "EXACT_TRANSACTION_ID",
          );
        },
      );
      await t.test(
        "requires explicit confirmation and enforces review permissions",
        async () => {
          const candidate = incoming.find(
            (t) => t.externalTransactionId === "KBZ100001",
          );
          assert.equal(
            (
              await call(`/reviews/${first}/resolve`, {
                method: "PATCH",
                body: json({ action: "APPROVE", transactionId: candidate.id }),
              })
            ).status,
            400,
          );
          const operator = await call(
            "/auth/login",
            {
              method: "POST",
              body: json({
                emailOrPhone: "test-operator@example.com",
                password,
              }),
            },
            null,
          );
          assert.equal(
            (
              await call(
                `/reviews/${first}/resolve`,
                {
                  method: "PATCH",
                  body: json({
                    action: "APPROVE",
                    transactionId: candidate.id,
                    confirmed: true,
                  }),
                },
                operator.data.accessToken,
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "two competing approvals can reserve a payment only once",
        async () => {
          const candidate = incoming.find(
            (t) => t.externalTransactionId === "KBZ100001",
          );
          const results = await Promise.all(
            [first, second].map((id) =>
              call(`/reviews/${id}/resolve`, {
                method: "PATCH",
                body: json({
                  action: "APPROVE",
                  transactionId: candidate.id,
                  confirmed: true,
                }),
              }),
            ),
          );
          assert.deepEqual(
            results.map((r) => r.status).sort(),
            [200, 409],
            json(results),
          );
          assert.equal(
            await prisma.usedTransaction.count({
              where: { transactionId: candidate.id },
            }),
            1,
          );
          const loser = results[0].status === 409 ? first : second;
          assert.equal(
            (
              await call(`/reviews/${loser}/resolve`, {
                method: "PATCH",
                body: json({
                  action: "MARK_DUPLICATE",
                  transactionId: candidate.id,
                }),
              })
            ).data.status,
            "DUPLICATE",
          );
        },
      );
      await t.test(
        "closed receipts cannot be reprocessed or approved again",
        async () => {
          const winner = (await prisma.usedTransaction.findFirst())
            .screenshotId;
          assert.equal(
            (
              await call(`/verification/screenshots/${winner}/process`, {
                method: "POST",
              })
            ).status,
            409,
          );
          assert.equal(
            (await details(winner, "KBZ100002", "20000")).status,
            409,
          );
          assert.equal(
            (
              await call(`/reviews/${third}/resolve`, {
                method: "PATCH",
                body: json({
                  action: "REJECT",
                  comment: "Receipt does not match",
                }),
              })
            ).data.status,
            "REJECTED",
          );
        },
      );
      await t.test(
        "approval updates dashboard and writes an audit trail",
        async () => {
          const dashboard = (await call("/dashboard?date=2026-10-27")).data;
          assert.equal(dashboard.receipts.VERIFIED, 1);
          assert.equal(dashboard.receipts.DUPLICATE, 1);
          assert.equal(dashboard.receipts.REJECTED, 1);
          assert.equal(
            await prisma.auditLog.count({ where: { action: "APPROVE" } }),
            1,
          );
          assert.equal(
            (await call("/screenshots?date=2026-10-27")).data.total,
            4,
          );
        },
      );
      await t.test(
        "simultaneous reviews cannot attach one receipt to different payments",
        async () => {
          const imported = await call("/imports", {
            method: "POST",
            body: upload(
              workbook([row("KBZ100003", "30000"), row("KBZ100004", "40000")]),
              "extra.xlsx",
            ),
          });
          assert.equal(imported.status, 201);
          const id = await receipt(5);
          const history = (await call("/transactions?date=2026-10-27")).data
            .items;
          const candidates = history.filter((item) =>
            ["KBZ100003", "KBZ100004"].includes(item.externalTransactionId),
          );
          const results = await Promise.all(
            candidates.map((candidate) =>
              call(`/reviews/${id}/resolve`, {
                method: "PATCH",
                body: json({
                  action: "APPROVE",
                  transactionId: candidate.id,
                  confirmed: true,
                  comment: "Test manual override after comparing history",
                }),
              }),
            ),
          );
          assert.deepEqual(
            results.map((result) => result.status).sort(),
            [200, 409],
          );
          assert.equal(
            await prisma.usedTransaction.count({ where: { screenshotId: id } }),
            1,
          );
        },
      );
      await t.test(
        "rotates refresh tokens, rejects replay and invalidates inactive users",
        async () => {
          const refreshed = await call(
            "/auth/refresh",
            {
              method: "POST",
              body: json({ refreshToken: tokens.refreshToken }),
            },
            null,
          );
          assert.equal(refreshed.status, 201);
          assert.notEqual(refreshed.data.refreshToken, tokens.refreshToken);
          assert.equal(
            (
              await call(
                "/auth/refresh",
                {
                  method: "POST",
                  body: json({ refreshToken: tokens.refreshToken }),
                },
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
      if (process.env.MVP_BROWSER_TEST === "1") {
        await t.test("desktop and mobile browser review journey", async () => {
          await require("../scripts/browser-smoke.cjs")({
            base,
            email: user.emailOrPhone,
            password,
            receiptId: fourth,
          });
        });
      }
    } finally {
      if (app) await app.close();
      if (prisma) await prisma.$disconnect();
      await root.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await root.$disconnect();
      await rm(process.env.STORAGE_LOCAL_DIR, { recursive: true, force: true });
    }
  },
);
