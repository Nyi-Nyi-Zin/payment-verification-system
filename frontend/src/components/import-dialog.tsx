"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importSchema, type ImportValues } from "@/lib/schemas";
import { today } from "@/lib/format";
import type { ApiClient } from "@/lib/api";
import type { ImportResult, Translate } from "@/lib/types";
import { ErrorNotice, Icon, Modal } from "./ui";

export function ImportDialog({
  open,
  onClose,
  api,
  sessionId,
  t,
  onDone,
  blocked,
}: {
  open: boolean;
  onClose: () => void;
  api: ApiClient;
  sessionId: number;
  t: Translate;
  onDone: (result: ImportResult) => void;
  blocked: boolean;
}) {
  const client = useQueryClient();
  const {
    setValue,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ImportValues>({ resolver: zodResolver(importSchema) });
  const mutation = useMutation({
    mutationFn: ({ file }: ImportValues) => {
      const body = new FormData();
      body.set("file", file);
      body.set("provider", "KBZPAY");
      body.set("businessDate", today());
      body.set("scope", "statement");
      return api.request<ImportResult>("/imports", { method: "POST", body });
    },
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["session", sessionId] });
      reset();
      onDone(result);
      onClose();
    },
  });
  function close() {
    if (!mutation.isPending) {
      reset();
      mutation.reset();
      onClose();
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title={t("importExcel")}
      t={t}
      id="import-dialog"
    >
      <p className="muted mb-5">{t("excelHelp")}</p>
      <form
        id="import-form"
        onSubmit={handleSubmit((values) => {
          if (!blocked) mutation.mutate(values);
        })}
        noValidate
        className="space-y-5"
      >
        <label htmlFor="import-file" className="block">
          {t("selectExcel")}
        </label>
        <input
          id="import-file"
          type="file"
          accept=".xlsx"
          disabled={blocked || mutation.isPending}
          aria-invalid={!!errors.file}
          aria-describedby={errors.file ? "excel-error" : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setValue("file", file, { shouldValidate: true });
            else reset();
          }}
        />
        {errors.file ? (
          <p id="excel-error" role="alert" className="form-error">
            {t(`error.${errors.file.message}`)}
          </p>
        ) : null}
        <ErrorNotice error={mutation.error} t={t} />
        <button
          id="import-submit"
          className="primary w-full"
          disabled={blocked || mutation.isPending}
        >
          <Icon
            name={mutation.isPending ? "loader-circle" : "upload"}
            spin={mutation.isPending}
          />
          {t(mutation.isPending ? "importing" : "importExcel")}
        </button>
      </form>
    </Modal>
  );
}
