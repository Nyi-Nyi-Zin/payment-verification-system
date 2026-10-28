-- Keep used-payment claims and referenced transactions when their upload is deleted.
ALTER TABLE "PaymentTransaction" DROP CONSTRAINT "PaymentTransaction_sourceImportId_fkey";
ALTER TABLE "PaymentTransaction" ALTER COLUMN "sourceImportId" DROP NOT NULL;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_sourceImportId_fkey"
  FOREIGN KEY ("sourceImportId") REFERENCES "PaymentImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsedTransaction" DROP CONSTRAINT "UsedTransaction_screenshotId_fkey";
ALTER TABLE "UsedTransaction" ALTER COLUMN "screenshotId" DROP NOT NULL;
ALTER TABLE "UsedTransaction" ADD CONSTRAINT "UsedTransaction_screenshotId_fkey"
  FOREIGN KEY ("screenshotId") REFERENCES "PaymentScreenshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
