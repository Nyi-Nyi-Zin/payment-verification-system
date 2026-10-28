import { businessDate, receiptTime } from "../src/common/business-date";
import { KbzpayOcrExtractor } from "../src/providers/kbzpay.ocr.extractor";
import { MatchingEngine } from "../src/verification/matching.engine";
import { ProviderCode } from "../src/common/enums/domain.enums";
import { MatchCandidate } from "../src/verification/verification.dto";

describe("MVP safety regressions", () => {
  const config = {
    beforeMinutes: 2,
    afterMinutes: 2,
    allowOutgoingAutoVerify: false,
    allowLevelThreeAutoVerify: false,
  };
  const candidate: MatchCandidate = {
    transactionId: "database-uuid",
    externalTransactionId: "KBZ123456",
    provider: ProviderCode.KBZPAY,
    direction: "INCOMING",
    amount: "10000.00",
    currency: "MMK",
    transactionAtUtc: new Date("2026-10-27T04:00:00Z"),
  };
  const input = {
    provider: ProviderCode.KBZPAY,
    direction: "INCOMING" as const,
    transactionId: "KBZ123456",
    amount: "10000.00",
    currency: "MMK",
    transactionAtUtc: new Date("2026-10-27T04:00:00Z"),
  };
  it("matches external IDs while preserving database IDs for reservation", () => {
    const result = new MatchingEngine().decide(input, [candidate], config);
    expect(result.status).toBe("VERIFIED");
    expect(result.candidate?.transactionId).toBe("database-uuid");
  });
  it("never falls back to amount/time when a supplied ID disagrees", () => {
    expect(
      new MatchingEngine().decide(
        { ...input, transactionId: "wrong" },
        [candidate],
        config,
      ).reasonCode,
    ).toBe("TRANSACTION_ID_NOT_FOUND");
  });
  it("does not match the right ID with the wrong amount", () => {
    expect(
      new MatchingEngine().decide(
        { ...input, amount: "99999" },
        [candidate],
        config,
      ).reasonCode,
    ).toBe("TRANSACTION_ID_AMOUNT_MISMATCH");
  });
  it("rejects rolled-over dates and invalid receipt times", () => {
    expect(() => businessDate("2026-02-30")).toThrow();
    expect(() => businessDate("2026-10-27T00:00:00Z")).toThrow();
    expect(receiptTime("2026-10-27", "25:00")).toBeNull();
    expect(receiptTime("2026-10-27", "10:30 AM")?.toISOString()).toBe(
      "2026-10-27T04:00:00.000Z",
    );
  });
  it("extracts conservative KBZPay fields without declaring direction or confidence", () => {
    const result = new KbzpayOcrExtractor().extract(
      "KBZPay\nAmount: ၁၀,၀၀၀ MMK\nTransaction ID: KBZ123456\n2026-10-27 10:30 AM",
    );
    expect(result.amount).toBe("10000.00");
    expect(result.transactionId).toBe("KBZ123456");
    expect(result.direction).toBe("UNKNOWN");
    expect(result.overallConfidence).toBeNull();
  });
});
