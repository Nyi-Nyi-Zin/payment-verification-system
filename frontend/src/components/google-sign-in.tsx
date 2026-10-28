"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api";
import type { Translate } from "@/lib/types";
import { ErrorNotice } from "./ui";

export function GoogleSignIn({
  api,
  t,
  link = false,
}: {
  api: ApiClient;
  t: Translate;
  link?: boolean;
}) {
  const options = useQuery({
    queryKey: ["auth-options"],
    queryFn: () => api.request<{ google: boolean }>("/auth/options"),
  });
  const google = useMutation({ mutationFn: () => api.google(link), gcTime: 0 });
  if (link && !options.data?.google) return null;
  return (
    <div className={link ? "space-y-2" : "mt-5 space-y-3"}>
      {!link ? (
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-200" />
          {t("orContinue")}
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      ) : null}
      <button
        id={link ? "connect-google" : "google-sign-in"}
        type="button"
        className={`secondary ${link ? "text-xs" : "w-full"}`}
        disabled={!options.data?.google || google.isPending}
        onClick={() => google.mutate()}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.51l3.34-2.59Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.96c1.47 0 2.79.51 3.83 1.51L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"
          />
        </svg>
        {t(link ? "connectGoogle" : "googleSignIn")}
      </button>
      {!link && options.data?.google === false ? (
        <p className="muted text-center text-xs">{t("googleNotConfigured")}</p>
      ) : null}
      <ErrorNotice error={google.error || options.error} t={t} />
      {options.error ? (
        <button className="secondary" onClick={() => void options.refetch()}>
          {t("retrySession")}
        </button>
      ) : null}
    </div>
  );
}
