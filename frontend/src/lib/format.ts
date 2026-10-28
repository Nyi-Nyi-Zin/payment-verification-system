export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const money = (value?: string | number | null) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
export function dateText(value?: string | null, time = true) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(time
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }
      : {}),
  }).format(new Date(value));
}
export function timeText(value?: string | null) {
  if (!value) return "—";
  const match = value
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return value;
  let hour = Number(match[1]);
  if (match[4]) hour = (hour % 12) + (match[4].toUpperCase() === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${match[2]}:${match[3] || "00"}`;
}
export const terminal = (status: string) =>
  ["VERIFIED", "DUPLICATE", "REJECTED"].includes(status);
export const transactionTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Yangon",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "—";
export const unavailable = (reason?: string | null) =>
  !!reason &&
  [
    "OCR_NOT_CONFIGURED",
    "OCR_LOCAL_MODELS_MISSING",
    "OCR_LOCAL_BUSY",
    "OCR_LOCAL_FAILED",
    "OCR_DRIVER_INVALID",
    "OCR_BILLING_DISABLED",
    "OCR_API_DISABLED",
    "OCR_KEY_INVALID",
    "OCR_ACCESS_DENIED",
    "OCR_QUOTA_EXCEEDED",
    "OCR_NETWORK_ERROR",
    "OCR_TIMEOUT",
  ].includes(reason);
export function verdict(
  status: string,
  reason?: string | null,
  duplicate?: boolean,
  error?: string | null,
  invalid = false,
) {
  if (status === "VERIFIED") return "matchTitle";
  if (status === "DUPLICATE")
    return duplicate ? "imageDuplicateTitle" : "duplicateTitle";
  if (status === "UNMATCHED")
    return reason === "TRANSACTION_ID_AMOUNT_MISMATCH"
      ? "mismatchTitle"
      : reason?.startsWith("MULTIPLE_") ||
          reason === "INSUFFICIENT_FIELDS_FOR_LEVEL_TWO"
        ? "uncertainTitle"
        : "notFoundTitle";
  if (status === "PROCESSING") return "checkingTitle";
  if (status === "FAILED")
    return error
      ? invalid
        ? "fileErrorTitle"
        : "requestFailedTitle"
      : unavailable(reason)
        ? "serviceFailedTitle"
        : "readFailedTitle";
  if (status === "REJECTED") return "rejectedTitle";
  return ["QUEUED", "RECEIVED"].includes(status)
    ? "queuedTitle"
    : "notCheckedTitle";
}
