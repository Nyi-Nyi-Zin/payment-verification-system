"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClient } from "@/lib/api";
import { dateText, money, today } from "@/lib/format";
import { ReceiptQueue, outcome } from "@/lib/queue";
import type {
  CheckResult,
  Dashboard,
  ImportRecord,
  ImportResult,
  Page,
  Receipt,
  Translate,
  User,
} from "@/lib/types";
import { Brand } from "./payment-desk";
import { Badge, Empty, ErrorNotice, Icon, Pagination } from "./ui";
import { ImportDialog } from "./import-dialog";
import { Imports, Wallet } from "./history";
import { ReceiptDetail } from "./receipt-detail";
import { Staff } from "./staff";
import { ChangePassword } from "./change-password";
import { GoogleSignIn } from "./google-sign-in";
import { Modal } from "./ui";
import { DeleteUpload } from "./delete-upload";

type View = "review" | "imports" | "transactions" | "staff";
type Source = "batch" | "saved";
const filters = [
  ["ALL", "all"],
  ["VERIFIED", "matches"],
  ["DUPLICATE", "duplicates"],
  ["UNMATCHED", "notFound"],
  ["FAILED", "attention"],
  ["RECEIVED", "pending"],
] as const;

export function Workspace({
  api,
  user,
  sessionId,
  t,
  onToggleLocale,
  onLogout,
  onPasswordChanged,
}: {
  api: ApiClient;
  user: User;
  sessionId: number;
  t: Translate;
  onToggleLocale: () => void;
  onLogout: () => Promise<void>;
  onPasswordChanged: () => void;
}) {
  const client = useQueryClient();
  const [view, setView] = useState<View>("review");
  const [source, setSource] = useState<Source>("saved");
  const [date, setDate] = useState(today);
  const [receiptDate, setReceiptDate] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<{
    source: Source;
    key: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const canUpload = ["ADMIN", "OPERATOR"].includes(user.role);
  const invalidate = () =>
    client.invalidateQueries({ queryKey: ["session", sessionId] });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set("file", file);
      body.set("provider", "KBZPAY");
      body.set("businessDate", today());
      return api.request<CheckResult>("/screenshots", { method: "POST", body });
    },
    onSuccess: () => {
      void invalidate();
    },
  });
  const process = useMutation({
    mutationFn: (id: string) =>
      api.request<CheckResult>(
        `/verification/screenshots/${encodeURIComponent(id)}/process`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void invalidate();
    },
  });
  const [queue] = useState(
    () =>
      new ReceiptQueue({
        upload: (file) => upload.mutateAsync(file),
        recheck: (id) => process.mutateAsync(id),
        onChange: (current) => {
          if (!current.follow) return;
          const item = current.items.find(
            (entry) => entry.phase === "uploading",
          );
          if (item) setSelection({ source: "batch", key: item.id });
        },
      }),
  );
  useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getServerSnapshot,
  );
  useEffect(() => {
    queue.activate();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.hasUnfinished) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      queue.abandon();
    };
  }, [queue]);
  const overview = useQuery({
    queryKey: ["session", sessionId, "dashboard", date],
    queryFn: ({ signal }) =>
      api.request<Dashboard>(`/dashboard?date=${date}`, { signal }),
  });
  const imports = useQuery({
    queryKey: ["session", sessionId, "imports", 1],
    queryFn: ({ signal }) =>
      api.request<Page<ImportRecord>>("/imports?page=1", { signal }),
  });
  const saved = useQuery({
    queryKey: ["session", sessionId, "receipts", receiptDate, filter, page],
    queryFn: ({ signal }) =>
      api.request<Page<Receipt>>(
        `/screenshots?${new URLSearchParams({ ...(receiptDate ? { date: receiptDate } : {}), page: String(page), status: filter })}`,
        { signal },
      ),
    enabled: source === "saved",
  });
  const titleKey =
    view === "review"
      ? "titleCheck"
      : view === "imports"
        ? "titleImports"
        : view === "staff"
          ? "navStaff"
          : "titleWallet";
  const introKey =
    view === "review"
      ? "introCheck"
      : view === "imports"
        ? "introImports"
        : view === "staff"
          ? "staffIntro"
          : "introWallet";
  const latest = imports.data?.items[0];
  const batchEntries = queue.items.filter(
    (item) =>
      filter === "ALL" ||
      outcome(item) === filter ||
      (filter === "RECEIVED" && outcome(item) === "QUEUED"),
  );
  const batchPages = Math.max(1, Math.ceil(batchEntries.length / 20));
  const currentPage = source === "batch" ? Math.min(page, batchPages) : page;
  const visibleBatch = batchEntries.slice(
    (currentPage - 1) * 20,
    currentPage * 20,
  );
  const selectedItem =
    selection?.source === "batch" && source === "batch"
      ? queue.items.find((item) => item.id === selection.key)
      : undefined;
  const activeItem =
    selectedItem && batchEntries.includes(selectedItem)
      ? selectedItem
      : source === "batch"
        ? visibleBatch[0]
        : undefined;
  const selectedSaved =
    source === "saved"
      ? saved.data?.items.find(
          (item) => selection?.source === "saved" && item.id === selection.key,
        ) || saved.data?.items[0]
      : undefined;
  const busy = queue.running || process.isPending || logoutBusy;
  const progress = queue.progress;
  const progressLabel = queue.running
    ? t(queue.pauseRequested ? "pausing" : "checking", {
        number: Math.min(progress.done + 1, progress.total),
        total: progress.total,
      })
    : queue.paused
      ? t("paused", progress)
      : queue.pending
        ? t("readyProgress", { count: queue.pending })
        : t("finished", progress);

  function addFiles(files: Iterable<File>) {
    if (!canUpload || busy || importOpen) return;
    queue.add(files);
    setSource("batch");
    setFilter("ALL");
    setPage(1);
    queue.setFollow(true);
    if (!selection || selection.source !== "batch")
      setSelection(
        queue.items[0] ? { source: "batch", key: queue.items[0].id } : null,
      );
  }
  function changeSource(next: Source) {
    setSource(next);
    setFilter("ALL");
    setPage(1);
    setSelection(null);
  }
  function changeDate(next: string) {
    if (view === "review" && source === "saved") {
      setReceiptDate(next);
      setPage(1);
      setSelection(null);
    } else if (next) setDate(next);
  }
  function openSavedReceipts() {
    changeSource("saved");
    setReceiptDate("");
    requestAnimationFrame(() => {
      document
        .getElementById("receipt-history")
        ?.scrollIntoView({ block: "start" });
      document
        .getElementById("receipt-history-title")
        ?.focus({ preventScroll: true });
    });
  }
  async function logout() {
    if (queue.hasUnfinished && !window.confirm(t("logoutWarning"))) return;
    setLogoutBusy(true);
    setLogoutError(null);
    try {
      await onLogout();
    } catch (cause) {
      setLogoutError(cause);
    } finally {
      setLogoutBusy(false);
    }
  }
  function start() {
    if (busy || importOpen || !canUpload) return;
    queue.setFollow(true);
    setSource("batch");
    setFilter("ALL");
    setPage(1);
    void queue.run();
  }
  function retry() {
    if (busy) return;
    if (activeItem) void queue.retry(activeItem.id);
    else if (selectedSaved) process.mutate(selectedSaved.id);
  }

  return (
    <div id="workspace" className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
        <Brand />
        <p className="eyebrow mb-3 mt-12 px-4 text-slate-500">
          {t("overview")}
        </p>
        <nav className="space-y-2" aria-label={t("workspace")}>
          {(
            [
              ["review", "scan-line", "navCheck"],
              ["imports", "file-spreadsheet", "navImports"],
              ["transactions", "folder-open", "navWallet"],
              ...(user.role === "ADMIN"
                ? [["staff", "folder-open", "navStaff"] as const]
                : []),
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              data-view={key}
              className={`nav-link w-full ${view === key ? "active" : ""}`}
              aria-current={view === key ? "page" : undefined}
              onClick={() => setView(key)}
            >
              <Icon name={icon} />
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-brand-50 p-4">
          <span className="mb-3 block text-brand-700">
            <Icon name="circle-check" />
          </span>
          <p className="font-semibold">{t("automatic")}</p>
          <p className="muted mt-2 text-xs leading-loose">{t("noApproval")}</p>
          <p className="mt-4 border-t border-brand-100 pt-3 text-xs text-brand-700">
            KBZPay · {t("localPrivate")}
          </p>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 md:px-8">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden items-center gap-2 text-slate-600 lg:flex">
            <span className="size-2 rounded-full bg-emerald-500" />
            {t("workspace")}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 md:gap-4">
            {queue.running || queue.paused ? (
              <button
                id="global-progress"
                className="secondary max-w-56 text-xs"
                onClick={() => {
                  setView("review");
                  changeSource("batch");
                }}
              >
                <Icon name="loader-circle" spin={queue.running} />
                <span>
                  {progress.done}/{progress.total}
                </span>
              </button>
            ) : null}
            <button
              id="language-toggle"
              className="secondary"
              onClick={onToggleLocale}
            >
              <Icon name="languages" />
              {t("switchLanguage")}
            </button>
            <span
              id="account-name"
              className="hidden max-w-48 truncate text-xs text-slate-600 md:block"
            >
              {user.displayName || user.emailOrPhone}
            </span>
            {!user.googleLinked && user.emailOrPhone.includes("@") ? (
              <GoogleSignIn api={api} t={t} link />
            ) : null}
            {user.hasPassword !== false ? (
              <button
                id="open-change-password"
                className="secondary text-xs"
                onClick={() => setPasswordOpen(true)}
                disabled={busy}
              >
                {t("changePassword")}
              </button>
            ) : null}
            <button
              id="logout"
              className="icon-button"
              aria-label={t("signOut")}
              disabled={logoutBusy}
              onClick={() => void logout()}
            >
              <Icon name="log-out" />
            </button>
          </div>
        </header>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white p-2 lg:hidden"
          aria-label={t("workspace")}
        >
          {(
            [
              ["review", "navCheck"],
              ["imports", "navImports"],
              ["transactions", "navWallet"],
              ...(user.role === "ADMIN"
                ? [["staff", "navStaff"] as const]
                : []),
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`nav-link shrink-0 text-xs ${view === key ? "active" : ""}`}
              data-view={key}
              aria-current={view === key ? "page" : undefined}
              onClick={() => setView(key)}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-400 space-y-6 px-4 py-7 md:px-8 md:py-9"
        >
          <div className="page-heading flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">{t("workflow")}</p>
              <h1 id="page-title">{t(titleKey)}</h1>
              <p className="muted mt-2 max-w-2xl leading-loose">
                {t(introKey)}
              </p>
            </div>
            {view === "review" ? (
              <button
                id="manage-saved-receipts"
                className="secondary"
                onClick={openSavedReceipts}
              >
                <Icon name="images" />
                {t("manageSavedReceipts")}
              </button>
            ) : null}
            {view === "transactions" ||
            (view === "review" && source === "saved") ? (
              <div id="date-filter" className="w-full sm:w-auto">
                <label
                  htmlFor="business-date"
                  className="mb-1 block text-xs text-slate-600"
                >
                  {t("historyDate")}
                </label>
                <input
                  id="business-date"
                  type="date"
                  value={view === "review" ? receiptDate : date}
                  onChange={(event) => changeDate(event.target.value)}
                  required={view === "transactions"}
                />
                {view === "review" ? (
                  <button
                    id="all-receipt-dates"
                    className="mt-2 text-xs font-semibold text-brand-700"
                    onClick={() => changeDate("")}
                    aria-pressed={!receiptDate}
                  >
                    {t("allReceiptDates")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {notice ? (
            <div id="notice" className="notice" role="status">
              <Icon name="circle-check" />
              {t(notice.duplicate ? "importDuplicate" : "importDone", {
                added: notice.parsedRows || 0,
                skipped: notice.skippedRows || 0,
                errors: notice.errorRows || 0,
              })}
            </div>
          ) : null}
          <ErrorNotice
            error={
              logoutError || overview.error || imports.error || process.error
            }
            t={t}
          />
          {overview.data && !overview.data.ocrConfigured ? (
            <div id="ocr-warning" className="notice warning" role="status">
              <Icon name="circle-alert" />
              {t(
                overview.data.ocrDriver === "tesseract"
                  ? "localUnavailable"
                  : "ocrUnavailable",
              )}
            </div>
          ) : null}
          <section
            id="review-view"
            hidden={view !== "review"}
            className="space-y-5"
          >
            <section
              id="excel-ready"
              className="panel grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 p-5 sm:flex sm:flex-wrap"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Icon name="file-spreadsheet" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="excel-status-title">
                  {t(latest ? "excelReady" : "excelMissing")}
                </h2>
                <p
                  id="excel-status-meta"
                  className="muted mt-1 text-xs leading-loose"
                >
                  {latest
                    ? t("excelMeta", {
                        count: imports.data?.total || 0,
                        date: dateText(latest.createdAt),
                      })
                    : t("excelMissingHelp")}
                </p>
              </div>
              {canUpload ? (
                <button
                  id="open-import"
                  data-action="open-import"
                  className="secondary col-span-2 w-full sm:w-auto"
                  disabled={busy}
                  onClick={() => setImportOpen(true)}
                >
                  <Icon name="upload" />
                  {t(latest ? "updateExcel" : "importExcel")}
                </button>
              ) : null}
            </section>
            {canUpload ? (
              <section id="upload-panel" className="panel p-5">
                <form
                  id="receipt-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    start();
                  }}
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2>{t("chooseReceipts")}</h2>
                    <span id="selection-count" className="muted text-xs">
                      {t("selectedFiles", { count: queue.items.length })}
                    </span>
                  </div>
                  <div
                    id="receipt-drop"
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!busy) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      addFiles(Array.from(event.dataTransfer.files));
                    }}
                    className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-6 text-center md:flex-row md:text-left ${dragging ? "border-brand-600 bg-brand-100" : "border-brand-100 bg-brand-50/40"}`}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-xs">
                      <Icon name="upload" />
                    </span>
                    <div className="drop-copy min-w-0 flex-1">
                      <h3>{t(dragging ? "dropActive" : "dropTitle")}</h3>
                      <p className="muted mt-1 text-xs leading-loose">
                        {t("dropHelp")}
                      </p>
                    </div>
                    <button
                      id="choose-files"
                      className="secondary"
                      type="button"
                      disabled={busy || importOpen}
                      onClick={() => fileInput.current?.click()}
                    >
                      <Icon name="images" />
                      {t("chooseImages")}
                    </button>
                    <input
                      ref={fileInput}
                      id="receipt-file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      hidden
                      disabled={busy || importOpen}
                      onChange={(event) => {
                        if (event.target.files)
                          addFiles(Array.from(event.target.files));
                        event.target.value = "";
                      }}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <p className="muted max-w-xl text-xs leading-loose">
                      {t("selectHint")}
                    </p>
                    <button
                      id="start-check"
                      type="submit"
                      className="primary"
                      disabled={busy || !queue.pending || importOpen}
                    >
                      <Icon name="scan-line" />
                      {t(queue.paused ? "resume" : "checkReceipts")}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}
            {queue.items.some((item) => item.phase !== "invalid") ? (
              <section
                id="batch-status"
                className="rounded-xl border border-brand-100 bg-brand-50 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong
                      id="progress-label"
                      role="status"
                      aria-live="polite"
                    >
                      {progressLabel}
                    </strong>
                    <p className="muted mt-1 text-xs">{t("pageOpen")}</p>
                  </div>
                  {queue.running ? (
                    <button
                      id="pause-check"
                      className="secondary"
                      disabled={queue.pauseRequested}
                      onClick={() => queue.pause()}
                    >
                      <Icon name="pause" />
                      {t("pause")}
                    </button>
                  ) : null}
                </div>
                <progress
                  id="batch-progress"
                  max={progress.total || 1}
                  value={progress.done}
                  aria-label={t("uploadSet")}
                />
              </section>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                {(["batch", "saved"] as const).map((value) => (
                  <button
                    key={value}
                    data-source={value}
                    aria-pressed={source === value}
                    className={`min-h-11 rounded-lg px-4 text-xs font-semibold ${source === value ? "bg-ink text-white" : "text-slate-600"}`}
                    onClick={() => changeSource(value)}
                  >
                    {t(value === "batch" ? "thisBatch" : "savedReceipts")}
                  </button>
                ))}
              </div>
              <p id="results-scope" className="muted text-xs">
                {source === "batch"
                  ? t("batchScope")
                  : receiptDate
                    ? dateText(receiptDate, false)
                    : t("allReceiptDates")}
              </p>
            </div>
            <div
              id="result-summary"
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t("result")}
            >
              {filters.map(([status, label]) => (
                <button
                  key={status}
                  data-filter={status}
                  aria-pressed={filter === status}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-medium ${filter === status ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"}`}
                  onClick={() => {
                    setFilter(status);
                    setPage(1);
                    setSelection(null);
                  }}
                >
                  {t(label)}
                  {source === "batch" ? (
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-xs">
                      {status === "ALL"
                        ? queue.items.length
                        : queue.items.filter(
                            (item) =>
                              outcome(item) === status ||
                              (status === "RECEIVED" &&
                                outcome(item) === "QUEUED"),
                          ).length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {source === "saved" ? (
              <p
                id="saved-receipts-help"
                className="muted text-sm leading-loose"
              >
                {t(
                  canUpload
                    ? "savedReceiptsDeleteHelp"
                    : "savedReceiptsViewHelp",
                )}
              </p>
            ) : null}
            <ErrorNotice error={saved.error} t={t} />
            <div
              id="receipt-history"
              className="grid min-w-0 scroll-mt-5 items-start gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.35fr)]"
            >
              <section className="panel overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
                  <div>
                    <h2 id="receipt-history-title" tabIndex={-1}>
                      {t("listTitle")}
                    </h2>
                    <p id="queue-count" className="muted mt-1 text-xs">
                      {t("listCount", {
                        count:
                          source === "batch"
                            ? batchEntries.length
                            : saved.data?.total || 0,
                      })}
                    </p>
                  </div>
                  <button
                    id="refresh"
                    className="icon-button"
                    aria-label={t("refresh")}
                    onClick={() => void invalidate()}
                  >
                    <Icon name="refresh-cw" />
                  </button>
                </div>
                <div id="receipt-list" className="divide-y divide-slate-100">
                  {source === "batch"
                    ? visibleBatch.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-2 p-4 ${activeItem?.id === item.id ? "bg-brand-50 ring-1 ring-inset ring-brand-100" : "hover:bg-slate-50"}`}
                        >
                          <button
                            data-select={item.id}
                            aria-pressed={activeItem?.id === item.id}
                            onClick={() => {
                              queue.setFollow(false);
                              setSelection({ source: "batch", key: item.id });
                            }}
                            className="min-h-11 min-w-0 flex-1 text-left"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong className="break-all text-xs">
                                {item.name}
                              </strong>
                              <Badge
                                status={outcome(item)}
                                reason={item.result?.reasonCode}
                                error={item.errorCode}
                                t={t}
                              />
                            </div>
                            <p className="muted mt-2 text-xs">
                              {t("fileSize", {
                                size: (item.size / (1024 * 1024)).toFixed(2),
                              })}
                            </p>
                            {item.errorCode ? (
                              <p className="mt-2 text-xs text-red-700">
                                {t(`error.${item.errorCode}`)}
                              </p>
                            ) : null}
                          </button>
                          {["queued", "invalid"].includes(item.phase) ? (
                            <button
                              className="icon-button"
                              data-remove={item.id}
                              aria-label={t("removeFile", { name: item.name })}
                              disabled={busy}
                              onClick={() => queue.remove(item.id)}
                            >
                              <Icon name="x" />
                            </button>
                          ) : canUpload && item.result?.screenshotId ? (
                            <DeleteUpload
                              api={api}
                              sessionId={sessionId}
                              kind="receipt"
                              id={item.result.screenshotId}
                              label={item.name}
                              t={t}
                              disabled={
                                busy || item.result.status === "PROCESSING"
                              }
                              onDeleted={() => {
                                queue.discardScreenshot(
                                  item.result!.screenshotId,
                                );
                                setSelection(null);
                                setPage(1);
                              }}
                            />
                          ) : null}
                        </div>
                      ))
                    : saved.data?.items.map((record) => (
                        <div
                          key={record.id}
                          className="flex items-start gap-2 pr-4"
                        >
                          <button
                            data-select={record.id}
                            aria-pressed={selectedSaved?.id === record.id}
                            className={`block min-h-20 min-w-0 flex-1 p-4 text-left ${selectedSaved?.id === record.id ? "bg-brand-50 ring-1 ring-inset ring-brand-100" : "hover:bg-slate-50"}`}
                            onClick={() =>
                              setSelection({ source: "saved", key: record.id })
                            }
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong>
                                {record.ocrResults?.[0]?.extractedAmount
                                  ? `${money(record.ocrResults[0].extractedAmount)} MMK`
                                  : `${t("receipt")} ${record.id.slice(0, 8)}`}
                              </strong>
                              <Badge
                                status={record.status}
                                reason={record.lastError}
                                t={t}
                              />
                            </div>
                            <p className="muted mt-2 break-all text-xs">
                              {record.ocrResults?.[0]?.extractedTransactionId ||
                                dateText(record.receivedAt)}
                            </p>
                          </button>
                          {canUpload ? (
                            <div className="pt-4">
                              <DeleteUpload
                                api={api}
                                sessionId={sessionId}
                                kind="receipt"
                                id={record.id}
                                label={`${t("receipt")} ${record.id.slice(0, 8)}`}
                                t={t}
                                disabled={
                                  busy || record.status === "PROCESSING"
                                }
                                onDeleted={() => {
                                  queue.discardScreenshot(record.id);
                                  setSelection(null);
                                  setPage(1);
                                }}
                              />
                            </div>
                          ) : null}
                        </div>
                      ))}
                  {source === "batch" && !batchEntries.length ? (
                    <Empty
                      title={t(queue.items.length ? "noFiltered" : "noFiles")}
                      help={t("noFilesHelp")}
                    />
                  ) : null}
                  {source === "saved" && !saved.data?.items.length ? (
                    <Empty
                      title={t(
                        saved.isPending
                          ? "refreshing"
                          : receiptDate
                            ? "noSaved"
                            : "noSavedAnyDate",
                      )}
                      help={t(
                        receiptDate ? "noSavedHelp" : "noSavedAnyDateHelp",
                      )}
                    />
                  ) : null}
                </div>
                <Pagination
                  name="receipts"
                  page={currentPage}
                  size={source === "batch" ? 20 : 50}
                  total={
                    source === "batch"
                      ? batchEntries.length
                      : saved.data?.total || 0
                  }
                  onPage={(next) => {
                    setPage(next);
                    setSelection(null);
                    queue.setFollow(false);
                  }}
                  t={t}
                  busy={source === "saved" && saved.isFetching}
                />
              </section>
              <ReceiptDetail
                key={`${source}-${activeItem?.id || selectedSaved?.id || "empty"}`}
                item={activeItem}
                saved={selectedSaved}
                api={api}
                sessionId={sessionId}
                t={t}
                onRetry={retry}
                canDelete={canUpload}
                onDeleted={(id) => {
                  queue.discardScreenshot(id);
                  setSelection(null);
                  setPage(1);
                }}
                busy={busy}
                retrying={
                  !!selectedSaved &&
                  process.isPending &&
                  process.variables === selectedSaved.id
                }
              />
            </div>
          </section>
          <div hidden={view !== "imports"}>
            <Imports
              api={api}
              sessionId={sessionId}
              t={t}
              canUpload={canUpload && !busy}
              onImport={() => setImportOpen(true)}
            />
          </div>
          <div hidden={view !== "transactions"}>
            <Wallet
              key={date}
              api={api}
              sessionId={sessionId}
              date={date}
              t={t}
            />
          </div>
          {view === "staff" && user.role === "ADMIN" ? (
            <Staff api={api} sessionId={sessionId} user={user} t={t} />
          ) : null}
          <footer className="border-t border-slate-200 py-5 text-xs text-slate-500">
            Payment Desk <span className="mx-2">·</span> KBZPay{" "}
            <span className="mx-2">·</span>
            {t("myanmarTime")}
          </footer>
        </main>
      </div>
      <ImportDialog
        key={importOpen ? "open" : "closed"}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        api={api}
        sessionId={sessionId}
        t={t}
        blocked={busy}
        onDone={setNotice}
      />
      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title={t("changePassword")}
        id="password-modal"
        t={t}
      >
        {passwordOpen ? (
          <ChangePassword api={api} t={t} onDone={onPasswordChanged} />
        ) : null}
      </Modal>
    </div>
  );
}
