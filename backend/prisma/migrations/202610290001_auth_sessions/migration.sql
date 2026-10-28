ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tempPasswordExpiresAt" TIMESTAMP(3);
UPDATE "User" SET "refreshTokenHash" = NULL;
CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "refreshHash" TEXT NOT NULL,
  "clientType" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE UNIQUE INDEX "AuthSession_one_active_per_user" ON "AuthSession"("userId") WHERE "revokedAt" IS NULL;
CREATE TABLE "AuthRateLimit" (
  "key" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "resetsAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "AuthRateLimit_resetsAt_idx" ON "AuthRateLimit"("resetsAt");
