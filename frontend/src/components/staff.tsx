"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClient } from "@/lib/api";
import type {
  Page,
  StaffUser,
  TemporaryCredentials,
  Translate,
  User,
} from "@/lib/types";
import { dateText } from "@/lib/format";
import { ErrorNotice, Modal, Pagination } from "./ui";

export function Staff({
  api,
  sessionId,
  user,
  t,
}: {
  api: ApiClient;
  sessionId: number;
  user: User;
  t: Translate;
}) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<StaffUser | "new" | null>(null);
  const [credentials, setCredentials] = useState<TemporaryCredentials | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const query = useQuery({
    queryKey: ["session", sessionId, "staff", page],
    queryFn: ({ signal }) =>
      api.request<Page<StaffUser>>("/users?page=" + page, { signal }),
  });
  const editing = editor && editor !== "new" ? editor : null;
  const self = !!editing && editing.id === user.id;
  const invalidate = () =>
    client.invalidateQueries({ queryKey: ["session", sessionId, "staff"] });
  async function reset() {
    if (!editing || self || busy || !window.confirm(t("resetPasswordWarning")))
      return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.request<TemporaryCredentials>(
        "/users/" + editing.id + "/reset-password",
        { method: "POST" },
      );
      setEditor(null);
      setCredentials(result);
      await invalidate();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="staff-view" className="panel">
      <div className="flex items-center justify-between gap-3 p-5">
        <h2>{t("navStaff")}</h2>
        <button
          id="create-staff"
          className="primary"
          onClick={() => {
            setError(null);
            setEditor("new");
          }}
        >
          {t("createStaff")}
        </button>
      </div>
      <ErrorNotice error={query.error} t={t} />
      {query.isPending ? (
        <p className="p-5 muted">{t("refreshing")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm max-sm:block">
            <thead className="max-sm:hidden">
              <tr>
                <th>{t("displayName")}</th>
                <th>{t("emailOrPhone")}</th>
                <th>{t("staffRole")}</th>
                <th>{t("staffStatus")}</th>
                <th>{t("staffActions")}</th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {query.data?.items.map((account) => (
                <tr
                  key={account.id}
                  data-staff={account.id}
                  className="max-sm:grid max-sm:grid-cols-2 max-sm:gap-3 max-sm:border-t max-sm:border-slate-100 max-sm:p-5"
                >
                  <td className="max-sm:col-span-2 max-sm:p-0 max-sm:font-semibold">
                    {account.displayName}
                  </td>
                  <td className="break-all max-sm:col-span-2 max-sm:p-0">
                    {account.emailOrPhone}
                  </td>
                  <td className="max-sm:p-0">
                    <span className="mb-1 block text-xs text-slate-500 sm:hidden">
                      {t("staffRole")}
                    </span>
                    {t("role." + account.role)}
                  </td>
                  <td className="max-sm:p-0">
                    <span className="mb-1 block text-xs text-slate-500 sm:hidden">
                      {t("staffStatus")}
                    </span>
                    {t("account." + account.status)}
                    {account.mustChangePassword ? (
                      <span className="block muted text-xs">
                        {t("passwordChangePending")}
                      </span>
                    ) : null}
                  </td>
                  <td className="max-sm:col-span-2 max-sm:p-0">
                    <button
                      className="secondary"
                      data-edit-staff={account.id}
                      onClick={() => {
                        setError(null);
                        setEditor(account);
                      }}
                    >
                      {t("editStaff")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        name="staff"
        page={page}
        total={query.data?.total || 0}
        onPage={setPage}
        busy={query.isFetching}
        t={t}
      />
      <Modal
        open={!!editor}
        onClose={() => {
          if (!busy) {
            setEditor(null);
            setError(null);
          }
        }}
        title={t(editing ? "editStaff" : "createStaff")}
        id="staff-editor"
        t={t}
      >
        {editor ? (
          <form
            key={editing?.id || "new"}
            id="staff-form"
            className="space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const values = {
                displayName: String(form.get("displayName")),
                ...(self ? {} : { role: String(form.get("role")) }),
                ...(editing
                  ? self
                    ? {}
                    : { status: String(form.get("status")) }
                  : { emailOrPhone: String(form.get("emailOrPhone")) }),
              };
              setBusy(true);
              setError(null);
              try {
                if (editing)
                  await api.request("/users/" + editing.id, {
                    method: "PATCH",
                    body: JSON.stringify(values),
                  });
                else
                  setCredentials(
                    await api.request<TemporaryCredentials>("/users", {
                      method: "POST",
                      body: JSON.stringify(values),
                    }),
                  );
                setEditor(null);
                await invalidate();
              } catch (cause) {
                setError(cause);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <label htmlFor="staff-name" className="mb-2 block">
                {t("displayName")}
              </label>
              <input
                id="staff-name"
                name="displayName"
                required
                maxLength={100}
                defaultValue={editing?.displayName || ""}
                disabled={busy}
              />
            </div>
            {!editing ? (
              <div>
                <label htmlFor="staff-identifier" className="mb-2 block">
                  {t("emailOrPhone")}
                </label>
                <input
                  id="staff-identifier"
                  name="emailOrPhone"
                  required
                  minLength={3}
                  maxLength={160}
                  disabled={busy}
                />
              </div>
            ) : (
              <p className="muted break-all">{editing.emailOrPhone}</p>
            )}
            <div>
              <label htmlFor="staff-role" className="mb-2 block">
                {t("staffRole")}
              </label>
              <select
                id="staff-role"
                name="role"
                defaultValue={editing?.role || "OPERATOR"}
                disabled={busy || self}
              >
                {["ADMIN", "OPERATOR", "REVIEWER"].map((role) => (
                  <option key={role} value={role}>
                    {t("role." + role)}
                  </option>
                ))}
              </select>
            </div>
            {editing ? (
              <div>
                <label htmlFor="staff-status" className="mb-2 block">
                  {t("staffStatus")}
                </label>
                <select
                  id="staff-status"
                  name="status"
                  defaultValue={editing.status}
                  disabled={busy || self}
                >
                  {["ACTIVE", "INACTIVE"].map((status) => (
                    <option key={status} value={status}>
                      {t("account." + status)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <ErrorNotice error={error} t={t} />
            <div className="flex flex-wrap justify-between gap-3">
              {editing && !self ? (
                <button
                  id="reset-staff-password"
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void reset()}
                >
                  {t("resetPassword")}
                </button>
              ) : null}
              <button id="save-staff" className="primary" disabled={busy}>
                {t(busy ? "saving" : "saveStaff")}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
      <Modal
        open={!!credentials}
        onClose={() => setCredentials(null)}
        title={t("temporaryPassword")}
        id="staff-credentials"
        t={t}
      >
        {credentials ? (
          <div className="space-y-4">
            <p className="break-all font-semibold">
              {credentials.user.emailOrPhone}
            </p>
            <p>{t("temporaryPasswordHelp")}</p>
            <output
              id="temporary-password"
              className="block break-all rounded-lg bg-slate-100 p-4 font-mono select-all"
            >
              {credentials.temporaryPassword}
            </output>
            <p className="muted text-xs">
              {t("temporaryPasswordExpiry", {
                date: dateText(credentials.expiresAt),
              })}
            </p>
            <button
              id="dismiss-credentials"
              className="primary"
              onClick={() => setCredentials(null)}
            >
              {t("credentialsSaved")}
            </button>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
