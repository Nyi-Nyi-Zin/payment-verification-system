const { existsSync, writeFileSync } = require("node:fs");
const { randomBytes } = require("node:crypto");
const { resolve } = require("node:path");
const path = resolve(__dirname, "../.env");
if (existsSync(path)) {
  console.log(".env already exists; no credentials were changed.");
  process.exit(0);
}
const secret = () => randomBytes(48).toString("hex");
writeFileSync(
  path,
  `NODE_ENV=development\nPORT=3000\nDATABASE_URL=postgresql://payment_verification:payment_verification@localhost:5432/payment_verification?schema=public\nJWT_SECRET=${secret()}\nJWT_REFRESH_SECRET=${secret()}\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=${randomBytes(18).toString("base64url")}\nSTORAGE_DRIVER=local\nSTORAGE_LOCAL_DIR=./data/objects\nGOOGLE_VISION_API_KEY=\nTELEGRAM_BOT_TOKEN=\nTELEGRAM_WEBHOOK_SECRET=\nDEFAULT_TOLERANCE_BEFORE_MINUTES=2\nDEFAULT_TOLERANCE_AFTER_MINUTES=2\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created backend/.env with random JWT secrets and an initial admin password.\nRead ADMIN_EMAIL and ADMIN_PASSWORD from that private file, then run pnpm prisma:migrate:deploy and pnpm db:seed.",
);
