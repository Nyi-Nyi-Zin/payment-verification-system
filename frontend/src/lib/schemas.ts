import { z } from "zod";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export interface UploadFile {
  name: string;
  size: number;
  type: string;
}
export const receiptSchema = z
  .custom<UploadFile>(
    (file) =>
      !!file &&
      typeof file === "object" &&
      "name" in file &&
      "size" in file &&
      "type" in file,
  )
  .superRefine((file, ctx) => {
    const code = !file.size
      ? "EMPTY_FILE"
      : file.size > MAX_FILE_BYTES
        ? "FILE_TOO_LARGE"
        : !/\.(png|jpe?g|webp)$/i.test(file.name) ||
            (file.type &&
              !["image/png", "image/jpeg", "image/webp"].includes(file.type))
          ? "FILE_TYPE"
          : null;
    if (code) ctx.addIssue({ code: "custom", message: code });
  });
export const excelSchema = z
  .custom<File>(
    (file) => typeof File !== "undefined" && file instanceof File,
    "SELECT_EXCEL",
  )
  .superRefine((file, ctx) => {
    const code = !file.size
      ? "EMPTY_FILE"
      : file.size > MAX_FILE_BYTES
        ? "FILE_TOO_LARGE"
        : !/\.xlsx$/i.test(file.name)
          ? "EXCEL_TYPE"
          : null;
    if (code) ctx.addIssue({ code: "custom", message: code });
  });
export const importSchema = z.object({ file: excelSchema });
export const loginSchema = z.object({
  emailOrPhone: z
    .string()
    .trim()
    .min(1, "REQUIRED")
    .min(3, "TOO_SHORT")
    .max(160, "TOO_LONG"),
  password: z
    .string()
    .min(1, "REQUIRED")
    .min(8, "TOO_SHORT")
    .max(128, "TOO_LONG"),
});
export const searchSchema = z.object({
  search: z.string().trim().max(100, "TOO_LONG"),
});
export const registerSchema = z
  .object({
    displayName: z.string().trim().min(2, "TOO_SHORT").max(100, "TOO_LONG"),
    emailOrPhone: z
      .string()
      .trim()
      .min(1, "REQUIRED")
      .max(160, "TOO_LONG")
      .regex(
        /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+?[0-9]{7,15})$/,
        "INVALID_IDENTIFIER",
      ),
    password: z
      .string()
      .refine(
        (value) =>
          [...value].length >= 12 &&
          new TextEncoder().encode(value).length <= 72,
        "PASSWORD_POLICY",
      ),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "PASSWORD_MISMATCH",
  });
export type RegisterValues = z.infer<typeof registerSchema>;
export type LoginValues = z.infer<typeof loginSchema>;
export type ImportValues = z.infer<typeof importSchema>;
export type SearchValues = z.infer<typeof searchSchema>;
export function validateReceipt(file: UploadFile): string | null {
  const result = receiptSchema.safeParse(file);
  return result.success ? null : result.error.issues[0]?.message || "FILE_TYPE";
}
