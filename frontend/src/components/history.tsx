"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { searchSchema, type SearchValues } from "@/lib/schemas";
import { dateText, money } from "@/lib/format";
import type { ApiClient } from "@/lib/api";
import type {
  ImportError,
  ImportRecord,
  Page,
  Transaction,
  Translate,
} from "@/lib/types";
import { Badge, Empty, ErrorNotice, Icon, Pagination } from "./ui";
import { DeleteUpload } from "./delete-upload";

export function Imports({
  api,
  sessionId,
  t,
  canUpload,
  onImport,
}: {
  api: ApiClient;
  sessionId: number;
  t: Translate;
  canUpload: boolean;
  onImport: () => void;
}) {
  const [page, setPage] = useState(1);
  const [errorId, setErrorId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["session", sessionId, "imports", page],
    queryFn: ({ signal }) =>
      api.request<Page<ImportRecord>>(`/imports?page=${page}`, { signal }),
  });
  const errors = useQuery({
    queryKey: ["session", sessionId, "import-errors", errorId],
    queryFn: ({ signal }) =>
      api.request<ImportError[]>(
        `/imports/${encodeURIComponent(errorId!)}/errors`,
        { signal },
      ),
    enabled: !!errorId,
  });
  return (
    <section id="imports-view" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="muted">{t("excelHelp")}</p>
        {canUpload ? (
          <button
            className="primary"
            data-action="open-import"
            onClick={onImport}
          >
            <Icon name="upload" />
            {t("importExcel")}
          </button>
        ) : null}
      </div>
      <ErrorNotice error={query.error} t={t} />
      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-180">
            <thead>
              <tr>
                {[
                  "file",
                  "status",
                  "importRows",
                  "rowErrors",
                  "importedAt",
                ].map((key) => (
                  <th key={key}>{t(key)}</th>
                ))}
                {canUpload ? <th>{t("staffActions")}</th> : null}
              </tr>
            </thead>
            <tbody id="imports-table">
              {query.data?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="text-brand-700">
                        <Icon name="file-spreadsheet" />
                      </span>
                      <span className="max-w-64 break-all font-medium">
                        {item.fileName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Badge status={item.status} t={t} />
                  </td>
                  <td>
                    {item.parsedRows} / {item.totalRows}
                  </td>
                  <td>
                    {item.errorRows ? (
                      <button
                        className="secondary"
                        data-errors={item.id}
                        onClick={() =>
                          setErrorId(errorId === item.id ? null : item.id)
                        }
                      >
                        {t(errorId === item.id ? "hideErrors" : "viewErrors", {
                          count: item.errorRows,
                        })}
                      </button>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="whitespace-nowrap muted">
                    {dateText(item.createdAt)}
                  </td>
                  {canUpload ? (
                    <td>
                      <DeleteUpload
                        api={api}
                        sessionId={sessionId}
                        kind="import"
                        id={item.id}
                        label={item.fileName}
                        t={t}
                        disabled={["UPLOADED", "PARSING"].includes(item.status)}
                        onDeleted={() => {
                          setErrorId(null);
                          setPage(1);
                        }}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {query.isPending ? (
          <Empty title={t("refreshing")} />
        ) : !query.data?.items.length ? (
          <Empty title={t("noImports")} help={t("noImportsHelp")} />
        ) : null}
        <Pagination
          name="imports"
          page={page}
          total={query.data?.total || 0}
          onPage={(next) => {
            setPage(next);
            setErrorId(null);
          }}
          t={t}
          busy={query.isFetching}
        />
      </section>
      {errorId ? (
        <section id="import-errors" className="panel p-5">
          <h2 className="mb-4">{t("rowErrors")}</h2>
          <ErrorNotice error={errors.error} t={t} />
          {errors.isPending ? (
            <p>{t("refreshing")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>{t("row")}</th>
                    <th>{t("details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.data?.map((error, index) => (
                    <tr key={index}>
                      <td>{error.sourceRowNumber}</td>
                      <td>
                        <p className="font-mono text-xs">{error.errorCode}</p>
                        <p>{error.errorMessage}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

export function Wallet({
  api,
  sessionId,
  date,
  t,
}: {
  api: ApiClient;
  sessionId: number;
  date: string;
  t: Translate;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SearchValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: "" },
  });
  const query = useQuery({
    queryKey: ["session", sessionId, "transactions", date, page, search],
    queryFn: ({ signal }) =>
      api.request<Page<Transaction>>(
        `/transactions?${new URLSearchParams({ date, page: String(page), search })}`,
        { signal },
      ),
  });
  return (
    <section id="transactions-view" className="space-y-5">
      <form
        id="history-search-form"
        onSubmit={handleSubmit(({ search }) => {
          setSearch(search);
          setPage(1);
        })}
        noValidate
      >
        <label htmlFor="history-search" className="sr-only">
          {t("searchPlaceholder")}
        </label>
        <div className="flex gap-2">
          <input
            id="history-search"
            type="search"
            placeholder={t("searchPlaceholder")}
            {...register("search")}
            aria-invalid={!!errors.search}
          />
          <button className="primary">
            <Icon name="search" />
            {t("search")}
          </button>
        </div>
        {errors.search ? (
          <p className="form-error" role="alert">
            {t(`error.${errors.search.message}`)}
          </p>
        ) : null}
      </form>
      <ErrorNotice error={query.error} t={t} />
      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {["transactionId", "amount", "time", "status"].map((key) => (
                  <th key={key}>{t(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody id="transactions-table">
              {query.data?.items.map((item) => (
                <tr key={item.id}>
                  <td className="break-all font-mono text-xs">
                    {item.externalTransactionId}
                  </td>
                  <td className="whitespace-nowrap font-semibold">
                    {money(item.amount)}{" "}
                    <span className="muted text-xs">
                      {item.currency || "MMK"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap muted">
                    {dateText(item.transactionAtUtc)}
                  </td>
                  <td>
                    <span
                      className={`inline-flex rounded-lg px-3 py-1 text-xs font-medium ${item.usedTransaction ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"}`}
                    >
                      {t(item.usedTransaction ? "alreadyUsed" : "available")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {query.isPending ? (
          <Empty title={t("refreshing")} />
        ) : !query.data?.items.length ? (
          <Empty title={t("noTransactions")} help={t("noTransactionsHelp")} />
        ) : null}
        <Pagination
          name="history"
          page={page}
          total={query.data?.total || 0}
          onPage={setPage}
          t={t}
          busy={query.isFetching}
        />
      </section>
    </section>
  );
}
