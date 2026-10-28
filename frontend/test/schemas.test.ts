import { test } from "node:test";
import assert from "node:assert/strict";
import {
  excelSchema,
  loginSchema,
  searchSchema,
  registerSchema,
} from "../src/lib/schemas";
import { verdict, timeText } from "../src/lib/format";

test("registration validates identifiers, confirmation and bcrypt byte limits without trimming passwords", () => {
  const input = {
    displayName: " New User ",
    emailOrPhone: " new@example.test ",
    password: " valid password ",
    confirmPassword: " valid password ",
  };
  assert.equal(registerSchema.parse(input).password, input.password);
  for (const changes of [
    { confirmPassword: "different" },
    { emailOrPhone: "invalid" },
    { displayName: " " },
    { password: "က".repeat(25), confirmPassword: "က".repeat(25) },
  ])
    assert.equal(
      registerSchema.safeParse({ ...input, ...changes }).success,
      false,
    );
  assert.equal(
    registerSchema.safeParse({ ...input, emailOrPhone: "+959123456789" })
      .success,
    true,
  );
});

test("form schemas reject missing credentials and oversized searches, preserving password whitespace", () => {
  assert.equal(
    loginSchema.safeParse({ emailOrPhone: "", password: "" }).success,
    false,
  );
  assert.deepEqual(
    loginSchema.parse({
      emailOrPhone: " person@example.test ",
      password: " secret ",
    }),
    { emailOrPhone: "person@example.test", password: " secret " },
  );
  assert.equal(
    searchSchema.safeParse({ search: "x".repeat(101) }).success,
    false,
  );
  assert.deepEqual(searchSchema.parse({ search: " 20000 " }), {
    search: "20000",
  });
});
test("Excel forms require a non-empty xlsx file no larger than 10 MB", () => {
  assert.equal(excelSchema.safeParse(undefined).success, false);
  assert.equal(
    excelSchema.safeParse(new File([], "empty.xlsx")).success,
    false,
  );
  assert.equal(
    excelSchema.safeParse(new File(["x"], "wrong.csv")).success,
    false,
  );
  assert.equal(
    excelSchema.safeParse(new File(["x"], "statement.XLSX")).success,
    true,
  );
  assert.equal(
    excelSchema.safeParse(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.xlsx"),
    ).success,
    false,
  );
});
test("outcome explanations distinguish amount conflicts, uncertain candidates and OCR setup failures", () => {
  assert.equal(
    verdict("UNMATCHED", "TRANSACTION_ID_AMOUNT_MISMATCH"),
    "mismatchTitle",
  );
  assert.equal(
    verdict("UNMATCHED", "MULTIPLE_LEVEL_TWO_CANDIDATES"),
    "uncertainTitle",
  );
  assert.equal(
    verdict("FAILED", "OCR_LOCAL_MODELS_MISSING"),
    "serviceFailedTitle",
  );
  assert.equal(verdict("DUPLICATE", undefined, true), "imageDuplicateTitle");
  assert.equal(timeText("12:10 AM"), "00:10:00");
  assert.equal(timeText("1:20 PM"), "13:20:00");
});
