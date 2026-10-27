-- DropForeignKey
ALTER TABLE "PaymentScreenshot" DROP CONSTRAINT "PaymentScreenshot_telegramUserId_fkey";

-- AlterTable
ALTER TABLE "PaymentScreenshot" ADD COLUMN     "businessDate" DATE,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'TELEGRAM',
ALTER COLUMN "telegramUpdateId" DROP NOT NULL,
ALTER COLUMN "telegramUserId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UsedTransaction_screenshotId_key" ON "UsedTransaction"("screenshotId");

-- AddForeignKey
ALTER TABLE "PaymentScreenshot" ADD CONSTRAINT "PaymentScreenshot_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "TelegramUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

