"use client";
import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api";
import type { Translate } from "@/lib/types";
import { ErrorNotice, Icon, Modal } from "./ui";

export function DeleteUpload({
  api,
  sessionId,
  kind,
  id,
  label,
  t,
  disabled,
  onDeleted,
  buttonLabel,
  triggerId,
}: {
  api: ApiClient;
  sessionId: number;
  kind: "receipt" | "import";
  id: string;
  label: string;
  t: Translate;
  disabled?: boolean;
  onDeleted: () => void;
  buttonLabel?: string;
  triggerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogId = `delete-upload-${useId()}`;
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      api.request(
        `/` +
          (kind === "receipt" ? "screenshots" : "imports") +
          `/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: ["session", sessionId] });
      // Remove deleted rows before invalidating so an old selection cannot refetch them.
      client.setQueriesData<{ items: { id: string }[]; total: number }>(
        {
          queryKey: [
            "session",
            sessionId,
            kind === "receipt" ? "receipts" : "imports",
          ],
        },
        (data) =>
          data
            ? {
                ...data,
                items: data.items.filter((item) => item.id !== id),
                total: Math.max(
                  0,
                  data.total -
                    (data.items.some((item) => item.id === id) ? 1 : 0),
                ),
              }
            : data,
      );
      if (kind === "receipt") {
        client.removeQueries({
          queryKey: ["session", sessionId, "detail", id],
        });
        client.removeQueries({ queryKey: ["session", sessionId, "image", id] });
      }
      setOpen(false);
      onDeleted();
      await client.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });
  return (
    <>
      <button
        type="button"
        id={triggerId}
        className="secondary shrink-0 whitespace-nowrap text-xs text-red-700"
        data-delete-upload={id}
        aria-label={t("deleteUploadNamed", { name: label })}
        disabled={disabled || remove.isPending}
        onClick={() => {
          remove.reset();
          setOpen(true);
        }}
      >
        <Icon name="x" />
        {buttonLabel || t("deleteUpload")}
      </button>
      {open ? (
        <Modal
          open={open}
          onClose={() => {
            if (!remove.isPending) setOpen(false);
          }}
          title={t("deleteUploadTitle")}
          t={t}
          id={dialogId}
        >
          <p className="break-all font-medium">{label}</p>
          <p className="muted mt-3 leading-loose">
            {t(
              kind === "receipt"
                ? "deleteReceiptWarning"
                : "deleteImportWarning",
            )}
          </p>
          <div className="mt-4">
            <ErrorNotice error={remove.error} t={t} />
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button
              className="secondary"
              disabled={remove.isPending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </button>
            <button
              className="primary"
              data-confirm-delete={id}
              disabled={remove.isPending || disabled}
              onClick={() => remove.mutate()}
            >
              {t(remove.isPending ? "deletingUpload" : "deleteUpload")}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
