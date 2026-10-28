"use client";
import { useState } from "react";
import { ApiClient, ApiError } from "@/lib/api";
import type { Translate } from "@/lib/types";
import { ErrorNotice } from "./ui";

export function ChangePassword({
  api,
  t,
  onDone,
  required = false,
}: {
  api: ApiClient;
  t: Translate;
  onDone: () => void;
  required?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <form
      id="change-password-form"
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const currentPassword = String(form.get("currentPassword"));
        const newPassword = String(form.get("newPassword"));
        if (newPassword !== form.get("confirmPassword")) {
          setError(new ApiError("PASSWORD_MISMATCH"));
          return;
        }
        if (
          [...newPassword].length < 12 ||
          new TextEncoder().encode(newPassword).length > 72
        ) {
          setError(new ApiError("PASSWORD_POLICY"));
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await api.changePassword({ currentPassword, newPassword });
          onDone();
        } catch (cause) {
          setError(cause);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        {t(required ? "passwordRequiredHelp" : "passwordChangeHelp")}
      </p>
      <p className="muted text-xs">{t("passwordPolicy")}</p>
      {(["currentPassword", "newPassword", "confirmPassword"] as const).map(
        (name) => (
          <div key={name}>
            <label className="mb-2 block" htmlFor={name}>
              {t(name)}
            </label>
            <input
              id={name}
              name={name}
              type="password"
              autoComplete={
                name === "currentPassword" ? "current-password" : "new-password"
              }
              required
              maxLength={name === "currentPassword" ? 128 : 72}
              disabled={busy}
            />
          </div>
        ),
      )}
      <ErrorNotice error={error} t={t} />
      <button
        id="change-password-submit"
        className="primary w-full"
        disabled={busy}
      >
        {t(busy ? "saving" : "changePassword")}
      </button>
    </form>
  );
}
