"use client";
/* Native Blob URLs must be acquired and released in an effect. */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, type ApiClient } from "@/lib/api";
import {
  dateText,
  money,
  terminal,
  timeText,
  transactionTime,
  unavailable,
  verdict,
} from "@/lib/format";
import { outcome, retryable, type QueueItem } from "@/lib/queue";
import type { Receipt, Translate } from "@/lib/types";
import { Badge, Empty, ErrorNotice, Icon, Modal } from "./ui";
import { DeleteUpload } from "./delete-upload";

export function ReceiptDetail({
  item,
  saved,
  api,
  sessionId,
  t,
  onRetry,
  busy,
  retrying,
  canDelete,
  onDeleted,
}: {
  item?: QueueItem;
  saved?: Receipt;
  api: ApiClient;
  sessionId: number;
  t: Translate;
  onRetry: () => void;
  busy: boolean;
  retrying: boolean;
  canDelete: boolean;
  onDeleted: (id: string) => void;
}) {
  const id = item?.result?.screenshotId || saved?.id;
  const detail = useQuery({
    queryKey: ["session", sessionId, "detail", id],
    queryFn: ({ signal }) =>
      api.request<Receipt>(`/screenshots/${encodeURIComponent(id!)}`, {
        signal,
      }),
    enabled: !!id,
  });
  const image = useQuery({
    queryKey: ["session", sessionId, "image", id],
    queryFn: ({ signal }) =>
      api.request<Blob>(`/screenshots/${encodeURIComponent(id!)}/image`, {
        signal,
      }),
    enabled: !!id,
    gcTime: 0,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const blob = image.data || item?.file;
    if (!blob) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image.data, item?.file]);
  const record = detail.data || saved;
  const status = retrying
    ? "PROCESSING"
    : item
      ? outcome(item)
      : record?.status || "QUEUED";
  const reason =
    item?.errorCode ||
    item?.result?.reasonCode ||
    record?.verificationResults?.[0]?.reasonCode ||
    record?.lastError;
  useEffect(() => {
    if (item?.id || saved?.id) heading.current?.focus({ preventScroll: true });
  }, [id, status, item?.id, saved?.id]);
  if (!item && !saved)
    return (
      <section className="panel" id="review-detail">
        <Empty title={t("resultEmpty")} help={t("resultEmptyHelp")} />
      </section>
    );
  const duplicate = item?.result?.duplicate;
  const fields = record?.ocrResults?.[0];
  const transaction = record?.verificationResults?.[0]?.transaction;
  const rows = [
    [
      "transactionId",
      fields?.extractedTransactionId,
      transaction?.externalTransactionId,
    ],
    [
      "amount",
      fields?.extractedAmount != null ? money(fields.extractedAmount) : null,
      transaction?.amount != null ? money(transaction.amount) : null,
    ],
    [
      "receiptDate",
      fields?.extractedDate ? dateText(fields.extractedDate, false) : null,
      transaction?.businessDate
        ? dateText(transaction.businessDate, false)
        : null,
    ],
    [
      "time",
      timeText(fields?.extractedTime),
      transactionTime(transaction?.transactionAtUtc),
    ],
    ["receiver", fields?.extractedReceiver, transaction?.receiverName],
  ];
  const aliases: Record<string, string> = {
    OCR_NOT_CONFIGURED_ENTER_DETAILS: "OCR_NOT_CONFIGURED",
    OCR_FAILED_ENTER_DETAILS: "OCR_FAILED",
  };
  const description = item?.errorCode
    ? t(`error.${item.errorCode}`)
    : duplicate
      ? t("imageDuplicateReason")
      : status === "PROCESSING"
        ? t("processingReason")
        : ["QUEUED", "RECEIVED"].includes(status)
          ? t("queuedReason")
          : t(
              `reason.${aliases[reason || ""] || reason || "AWAITING_RECEIPT_DETAILS"}`,
            );
  const canRetry = item
    ? retryable(item)
    : !!id && (!terminal(status) || status === "DUPLICATE") && status !== "PROCESSING";
  return (
    <section
      id="review-detail"
      className="panel overflow-hidden"
      aria-label={t("result")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="min-w-0">
          <h2 className="break-all">
            {item?.name || `${t("receipt")} ${id?.slice(0, 8)}`}
          </h2>
          {record?.receivedAt ? (
            <p className="muted mt-1 text-xs">
              {t("uploadedAt", { date: dateText(record.receivedAt) })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            status={status}
            reason={reason}
            error={item?.errorCode}
            t={t}
          />
          {canDelete && id ? (
            <DeleteUpload
              api={api}
              sessionId={sessionId}
              kind="receipt"
              id={id}
              label={item?.name || `${t("receipt")} ${id.slice(0, 8)}`}
              t={t}
              disabled={busy || status === "PROCESSING"}
              buttonLabel={t("deleteReceipt")}
              triggerId="delete-selected-receipt"
              onDeleted={() => onDeleted(id)}
            />
          ) : null}
        </div>
      </div>
      <div className="p-5">
        <section
          className={`rounded-xl border p-4 ${status === "VERIFIED" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : status === "DUPLICATE" ? "border-amber-200 bg-amber-50 text-amber-900" : ["FAILED", "UNMATCHED", "REJECTED"].includes(status) ? "border-red-200 bg-red-50 text-red-900" : "border-brand-100 bg-brand-50 text-brand-700"}`}
        >
          <h3
            ref={heading}
            id="result-title"
            tabIndex={-1}
            className="text-base"
          >
            {t(
              verdict(
                status,
                reason,
                duplicate,
                item?.errorCode,
                item?.phase === "invalid",
              ),
            )}
          </h3>
          <p className="result-reason mt-2 leading-loose">{description}</p>
          {duplicate && record ? (
            <p className="mt-3 font-medium">
              {t("originalResult", { status: t(`status.${record.status}`) })}
            </p>
          ) : null}
          {item?.errorDetails ? (
            <p className="mt-3 whitespace-pre-wrap break-words">
              {item.errorDetails}
            </p>
          ) : null}
          {canRetry ? (
            <button
              id="run-ocr"
              className="secondary mt-4"
              data-action="retry"
              disabled={busy}
              onClick={onRetry}
            >
              <Icon name="refresh-cw" />
              {t(retrying ? "retrying" : id ? "retry" : "retryUpload")}
            </button>
          ) : null}
        </section>
        <div className="mt-5 space-y-4">
          <ErrorNotice error={detail.error} t={t} />
          <h3>{t("detailsTitle")}</h3>
          {fields || transaction ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-105 text-xs">
                <thead>
                  <tr>
                    <th>{t("field")}</th>
                    <th>{t("receipt")}</th>
                    <th>{t("excel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, receipt, excel]) => (
                    <tr key={label}>
                      <td>{t(label!)}</td>
                      <td className="break-all">{receipt || "—"}</td>
                      <td className="break-all">{excel || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">
              {t(id && detail.isPending ? "imageLoading" : "notAvailable")}
            </p>
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
            {imageUrl ? (
              <>
                <img
                  id="receipt-image"
                  src={imageUrl}
                  alt={t("preview")}
                  className="mx-auto max-h-72 max-w-full rounded-lg object-contain"
                />
                <button
                  className="secondary mt-4"
                  data-action="zoom"
                  onClick={() => setZoom(true)}
                >
                  <Icon name="zoom-in" />
                  {t("zoom")}
                </button>
              </>
            ) : (
              <p className="muted py-10">
                {t(
                  image.isFetching
                    ? "imageLoading"
                    : image.isError
                      ? "imageUnavailable"
                      : "imagePending",
                )}
              </p>
            )}
            {image.isError ? (
              <button
                className="secondary"
                onClick={() => void image.refetch()}
              >
                {t("refresh")}
              </button>
            ) : null}
          </div>
          {status === "VERIFIED" ? (
            <p className="muted text-xs leading-relaxed">
              {t("matchDisclaimer")}
            </p>
          ) : null}
          {unavailable(reason) && status === "FAILED" ? (
            <span className="sr-only">{t("ocrUnavailable")}</span>
          ) : null}
        </div>
      </div>
      <Modal
        open={zoom}
        onClose={() => setZoom(false)}
        title={t("preview")}
        t={t}
        id="image-dialog"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={t("preview")}
            className="mx-auto max-w-full"
          />
        ) : (
          <ErrorNotice error={new ApiError("REQUEST_FAILED")} t={t} />
        )}
      </Modal>
    </section>
  );
}
