require("dotenv").config({ quiet: true });
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
const prisma = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters)",
    );
  const existing = await prisma.user.findUnique({
    where: { emailOrPhone: email },
  });
  if (existing) {
    console.log("Admin account already exists; credentials were not changed.");
    return;
  }
  await prisma.user.create({
    data: {
      emailOrPhone: email,
      displayName: "Administrator",
      role: "ADMIN",
      status: "ACTIVE",
      passwordHash: await hash(password, 12),
    },
  });
  console.log("Initial admin account created.");
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
