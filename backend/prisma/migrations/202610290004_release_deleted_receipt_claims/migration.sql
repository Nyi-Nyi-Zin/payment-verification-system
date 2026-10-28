-- Old receipt deletion detached claims instead of releasing their payments.
-- Remove only those orphan claims; claims belonging to saved receipts stay unique.
DELETE FROM "UsedTransaction" WHERE "screenshotId" IS NULL;

ALTER TABLE "UsedTransaction" DROP CONSTRAINT "UsedTransaction_screenshotId_fkey";
ALTER TABLE "UsedTransaction" ALTER COLUMN "screenshotId" SET NOT NULL;
ALTER TABLE "UsedTransaction" ADD CONSTRAINT "UsedTransaction_screenshotId_fkey"
  FOREIGN KEY ("screenshotId") REFERENCES "PaymentScreenshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
