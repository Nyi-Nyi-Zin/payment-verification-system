ALTER TABLE "User" ADD COLUMN "googleSubject" TEXT;
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
-- Identifiers must remain unique regardless of email letter casing.
CREATE UNIQUE INDEX "User_emailOrPhone_lower_key" ON "User"(LOWER("emailOrPhone"));
