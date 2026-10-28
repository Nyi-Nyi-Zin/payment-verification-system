import { BadRequestException } from "@nestjs/common";

export function businessDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException("Use a YYYY-MM-DD business date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException("Invalid business date");
  }
  return date;
}

export function receiptTime(
  date: string | null,
  time: string | null,
): Date | null {
  if (!date || !time) return null;
  try {
    businessDate(date);
  } catch {
    return null;
  }
  const match = time
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (
    minute > 59 ||
    second > 59 ||
    (match[4] ? hour < 1 || hour > 12 : hour > 23)
  )
    return null;
  if (match[4]) hour = (hour % 12) + (match[4].toUpperCase() === "PM" ? 12 : 0);
  return new Date(
    Date.parse(`${date}T00:00:00.000Z`) +
      (hour * 3600 + minute * 60 + second - 23400) * 1000,
  );
}
