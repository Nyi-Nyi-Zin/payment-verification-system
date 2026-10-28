import { KbzpayOcrExtractor } from "../src/providers/kbzpay.ocr.extractor";

describe("KBZPay Myanmar E-Receipt extraction", () => {
  // Synthetic text follows the supplied layout; no real account or transaction data.
  const receipt =
    "KBZ BANK\nE-Receipt\n-1.00 Ks\nလုပ်ဆောင်သောအချိန်\n28/10/2026 01:09:51\nလုပ်ဆောင်မှုအမှတ်\n01000000000000000001\nTransfer\nTest Recipient (*****1234)\nThank you for using KBZPay!";

  it("reads the Myanmar transaction label and payer debit amount as a payment magnitude", () => {
    expect(new KbzpayOcrExtractor().extract(receipt)).toMatchObject({
      provider: "KBZPAY",
      transactionId: "01000000000000000001",
      amount: "1.00",
      date: "2026-10-28",
      time: "01:09:51",
      currency: "MMK",
      direction: "UNKNOWN",
    });
  });

  it("handles an unreadable label when one isolated 20-digit reference is present", () => {
    const text = receipt
      .replace("လုပ်ဆောင်မှုအမှတ်", "unreadable label")
      .replace("01000000000000000001", "0100 0000 0000 0000 0001");
    expect(new KbzpayOcrExtractor().extract(text).transactionId).toBe(
      "01000000000000000001",
    );
  });

  it("does not choose between two unlabeled reference numbers", () => {
    const text =
      receipt.replace("လုပ်ဆောင်မှုအမှတ်", "unreadable label") +
      "\n01000000000000000002";
    expect(new KbzpayOcrExtractor().extract(text).transactionId).toBeNull();
  });

  it("normalizes Myanmar digits while retaining the leading zero in references", () => {
    const text = receipt.replace(/\d/g, (digit) =>
      String.fromCharCode(0x1040 + Number(digit)),
    );
    expect(new KbzpayOcrExtractor().extract(text)).toMatchObject({
      transactionId: "01000000000000000001",
      amount: "1.00",
      date: "2026-10-28",
    });
  });

  it("does not mistake the next column label for a transaction reference", () => {
    const text =
      "Transaction Time\nTransaction No.\nTransaction Type\nTransfer To\nAmount\n" +
      "E-Receipt\n-300.00\n10/10/2026 15:36:23\n01000000000000000001\n" +
      "Transfer\n-300.00 Ks\nPayment\nThank you for using KBZPay!";
    expect(new KbzpayOcrExtractor().extract(text)).toMatchObject({
      provider: "KBZPAY",
      transactionId: "01000000000000000001",
      amount: "300.00",
      date: "2026-10-10",
    });
  });

  it("does not accept label words or partial references as transaction IDs", () => {
    for (const value of [
      "Transaction Type",
      "Transfer",
      "Payment",
      "KBZ123!456",
    ])
      expect(
        new KbzpayOcrExtractor().extract(`KBZPay\nTransaction ID: ${value}`)
          .transactionId,
      ).toBeNull();
  });

  it("reads a labeled reference split into digit groups without truncating it", () => {
    const text =
      "KBZPay\nTransaction No.\n0100 0000 0000 0000 0001\n" +
      "Transaction Type\nTransfer\nAmount\n-350,000.00 Ks\n10/10/2026 13:26:28";
    expect(new KbzpayOcrExtractor().extract(text)).toMatchObject({
      transactionId: "01000000000000000001",
      amount: "350000.00",
      date: "2026-10-10",
    });
  });
});
