"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { unavailable } from "@/lib/format";
import type { Translate } from "@/lib/types";

export function Icon({ name, spin = false }: { name: string; spin?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`icon icon-${name}${spin ? " animate-spin" : ""}`}
    />
  );
}
export function Badge({
  status,
  reason,
  error,
  t,
}: {
  status: string;
  reason?: string | null;
  error?: string | null;
  t: Translate;
}) {
  const success = ["VERIFIED", "COMPLETED"].includes(status);
  const warning = ["DUPLICATE", "COMPLETED_WITH_ERRORS"].includes(status);
  const failed = ["UNMATCHED", "FAILED", "REJECTED"].includes(status);
  return (
    <span
      className={`badge ${success ? "success" : warning ? "warning" : failed ? "danger" : ""} inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${success ? "bg-emerald-50 text-emerald-800" : warning ? "bg-amber-50 text-amber-900" : failed ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700"}`}
    >
      <Icon
        name={
          success
            ? "circle-check"
            : failed
              ? "circle-x"
              : warning
                ? "circle-alert"
                : status === "PROCESSING"
                  ? "loader-circle"
                  : "image"
        }
        spin={status === "PROCESSING"}
      />
      {error
        ? t("attention")
        : t(
            `status.${status === "FAILED" && unavailable(reason) ? "OCR_UNAVAILABLE" : status}`,
          )}
    </span>
  );
}
export function ErrorNotice({ error, t }: { error: unknown; t: Translate }) {
  if (!error) return null;
  return (
    <div className="notice danger" role="alert">
      <Icon name="circle-alert" />
      <span>
        {t(
          `error.${error instanceof ApiError ? error.code : "REQUEST_FAILED"}`,
        )}
      </span>
      {error instanceof ApiError && error.details ? (
        <details className="w-full">
          <summary className="cursor-pointer">{t("details")}</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">
            {error.details}
          </p>
        </details>
      ) : null}
    </div>
  );
}
export function Empty({ title, help }: { title: string; help?: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon name="images" />
      </span>
      <h3>{title}</h3>
      {help ? <p className="muted max-w-sm">{help}</p> : null}
    </div>
  );
}
export function Pagination({
  page,
  total,
  size = 50,
  onPage,
  t,
  name,
  busy = false,
}: {
  page: number;
  total: number;
  size?: number;
  onPage: (page: number) => void;
  t: Translate;
  name: string;
  busy?: boolean;
}) {
  const max = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
      <button
        className="icon-button"
        data-page={`${name}-prev`}
        aria-label={t("previous")}
        disabled={page <= 1 || busy}
        onClick={() => onPage(page - 1)}
      >
        <Icon name="chevron-left" />
      </button>
      <span id={`${name}-page`} className="muted text-xs">
        {t("page", { current: page, total: max })}
      </span>
      <button
        className="icon-button"
        data-page={`${name}-next`}
        aria-label={t("next")}
        disabled={page >= max || busy}
        onClick={() => onPage(page + 1)}
      >
        <Icon name="chevron-right" />
      </button>
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
  t,
  id,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  t: Translate;
  id: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={`${id}-title`}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("close")}
          onClick={onClose}
        >
          <Icon name="x" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
