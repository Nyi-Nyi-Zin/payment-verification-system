import * as XLSX from "xlsx";
import { ProviderCode } from "../src/common/enums/domain.enums";
import { KbzpayExcelParser } from "../src/providers/kbzpay.excel.parser";

function workbookBuffer(): Buffer {
  const rows = [
    ["Account Holder Name:", "Nyi Nyi Zin"],
    ["Phone Number:", "09675507310"],
    ["NRC/Passport Number:", "11/THATANA(N)111843"],
    ["Account Type:", "KBZPay Customer Account"],
    ["Time Period:", "From 23-05-2026 00:00:00 To 22-08-2026 23:59:59"],
    [
      "   Transaction Date & Time",
      "         Tm_Ref_No",
      "               Detailed Description",
      "Notes",
      "        Credit",
      "       Debit",
      "         Balance",
    ],
    [
      null,
      null,
      "          Opening Balance",
      null,
      null,
      null,
      "     1,170.00",
    ],
    [
      "     23-05-2026 20:59:18",
      "       01004160031336934373",
      "P2P Transfer to 959*********;P2P Transfer from 959*********",
      "မေမေ",
      "       20,000.00",
      "    -0.00",
      "     21,170.00",
    ],
    [
      "     23-05-2026 21:01:10",
      "       01004160071337025087",
      "P2P Transfer to 959*********;P2P Transfer from 959*********",
      "Payment",
      "       0.00",
      "    -18,000.00",
      "     3,170.00",
    ],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("KbzpayExcelParser", () => {
  it.each([true, false])(
    "excludes QuickPay fees sharing the payment reference, fee first: %s",
    async (feeFirst) => {
      const workbook = XLSX.read(workbookBuffer(), { type: "buffer" });
      const payment = [
        "28-09-2026 14:05:53",
        "QUICKPAY001",
        "OnlinePayment for QuickPay",
        "",
        "0.00",
        "-60,900.00",
        "1000.00",
      ];
      const fee = [
        "28-09-2026 14:05:53",
        "QUICKPAY001",
        "QuickPay Fee Charge from 959*********",
        "",
        "0.00",
        "-500.00",
        "500.00",
      ];
      XLSX.utils.sheet_add_aoa(
        workbook.Sheets.Sheet1,
        feeFirst ? [fee, payment] : [payment, fee],
        { origin: -1 },
      );
      const result = await new KbzpayExcelParser().parse(
        XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
        "statement.xlsx",
      );
      expect(result.errors).toHaveLength(0);
      expect(
        result.transactions.filter(
          (row) => row.externalTransactionId === "QUICKPAY001",
        ),
      ).toEqual([
        expect.objectContaining({ amount: "60900.00", direction: "OUTGOING" }),
      ]);
      expect(result.transactions).toHaveLength(3);
    },
  );

  it("preserves conflicting payments and incoming rows for import validation", async () => {
    const workbook = XLSX.read(workbookBuffer(), { type: "buffer" });
    XLSX.utils.sheet_add_aoa(
      workbook.Sheets.Sheet1,
      [
        [
          "28-09-2026 14:05:53",
          "CONFLICT001",
          "OnlinePayment for QuickPay",
          "",
          "0",
          "-60900",
          "1000",
        ],
        [
          "28-09-2026 14:05:53",
          "CONFLICT001",
          "OnlinePayment for QuickPay",
          "",
          "0",
          "-500",
          "500",
        ],
        [
          "28-09-2026 14:05:53",
          "CREDIT001",
          "QuickPay Fee Charge from 959*********",
          "",
          "500",
          "0",
          "1000",
        ],
      ],
      { origin: -1 },
    );
    const result = await new KbzpayExcelParser().parse(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
      "statement.xlsx",
    );
    expect(result.errors).toHaveLength(0);
    expect(
      result.transactions.filter(
        (row) => row.externalTransactionId === "CONFLICT001",
      ),
    ).toHaveLength(2);
    expect(
      result.transactions.find(
        (row) => row.externalTransactionId === "CREDIT001",
      ),
    ).toMatchObject({ amount: "500.00", direction: "INCOMING" });
  });

  it("imports all statement dates without a date filter and skips statement footer text", async () => {
    const workbook = XLSX.read(workbookBuffer(), { type: "buffer" });
    const sheet = workbook.Sheets.Sheet1;
    XLSX.utils.sheet_add_aoa(
      sheet,
      [
        [
          "24-05-2026 10:00:00",
          "OTHER-DAY-REF",
          "Received transfer",
          "",
          "5000",
          "0",
          "8170",
        ],
        [null, null, "Credit Total", null, "25000"],
        [null, null, "Debit Total", null, null, "-18000"],
        ["Thank you for using KBZPay"],
        [
          "Customers are responsible for verifying the accuracy of transaction records.",
        ],
        [
          "This is a auto-generated document and no further signature is required.",
        ],
      ],
      { origin: -1 },
    );
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const result = await new KbzpayExcelParser().parse(bytes, "statement.xlsx");
    expect(result.transactions.map((row) => row.businessDate)).toEqual([
      "2026-05-23",
      "2026-05-23",
      "2026-05-24",
    ]);
    expect(result.errors).toHaveLength(0);
    const dayOnly = await new KbzpayExcelParser().parse(
      bytes,
      "statement.xlsx",
      "2026-05-23",
    );
    expect(dayOnly.transactions).toHaveLength(2);
    expect(dayOnly.errors).toHaveLength(1);
  });
  it("normalizes KBZPay rows and excludes the opening balance", async () => {
    const parser = new KbzpayExcelParser();
    const result = await parser.parse(
      workbookBuffer(),
      "kbzpay.xlsx",
      "2026-05-23",
    );

    expect(result.provider).toBe(ProviderCode.KBZPAY);
    expect(result.transactions).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions[0]).toMatchObject({
      externalTransactionId: "01004160031336934373",
      direction: "INCOMING",
      amount: "20000.00",
      reference: "မေမေ",
      currency: "MMK",
    });
    expect(result.transactions[1]).toMatchObject({
      externalTransactionId: "01004160071337025087",
      direction: "OUTGOING",
      amount: "18000.00",
      reference: "Payment",
    });
  });
});
