"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClient, ApiError } from "@/lib/api";
import { translate } from "@/lib/i18n";
import type { Locale, User } from "@/lib/types";
import { Login } from "./login";
import { Workspace } from "./workspace";
import { ErrorNotice, Icon } from "./ui";
import { ChangePassword } from "./change-password";

let fallbackLocale: Locale = "my";
function getLocale(): Locale {
  try {
    return localStorage.getItem("paymentDesk.language") === "en" ? "en" : "my";
  } catch {
    return fallbackLocale;
  }
}
function subscribeLocale(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("paymentdesk-locale", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("paymentdesk-locale", listener);
  };
}
const serverLocale = (): Locale => "my";

export function PaymentDesk() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 15000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false, networkMode: "always" },
        },
      }),
  );
  const [api] = useState(() => new ApiClient());
  const locale = useSyncExternalStore(subscribeLocale, getLocale, serverLocale);
  const [session, setSession] = useState<{ user: User; id: number } | null>(
    null,
  );
  const [loginError, setLoginError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [oauthError, setOauthError] = useState<ApiError | null>(null);
  const t = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      translate(locale, key, values),
    [locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    return api.subscribeExpired(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
      setSession(null);
      setLoginError(new ApiError("SESSION_EXPIRED"));
    });
  }, [api, queryClient]);
  useEffect(() => {
    let live = true;
    let revision = 0;
    const restore = async () => {
      const current = ++revision;
      setLoading(true);
      setBootstrapError(null);
      try {
        const restored = await api.restore();
        if (live && current === revision) {
          setSession(restored ? { user: restored.user, id: Date.now() } : null);
          const status = new URLSearchParams(window.location.hash.slice(1)).get(
            "oauth",
          );
          if (status) {
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
            if (status === "success" && restored) api.announceLogin();
            if (status !== "success")
              setOauthError(
                new ApiError(
                  status === "account_exists"
                    ? "GOOGLE_ACCOUNT_EXISTS"
                    : status === "cancelled"
                      ? "GOOGLE_CANCELLED"
                      : "GOOGLE_FAILED",
                ),
              );
          }
        }
      } catch (cause) {
        if (live && current === revision) setBootstrapError(cause);
      } finally {
        if (live && current === revision) setLoading(false);
      }
    };
    const disconnect = api.connect((kind) => {
      void queryClient.cancelQueries();
      queryClient.clear();
      setSession(null);
      setLoginError(null);
      setPasswordChanged(false);
      if (kind === "login") void restore();
      else {
        revision++;
        setLoading(false);
        setBootstrapError(null);
      }
    });
    void restore();
    return () => {
      live = false;
      disconnect();
    };
  }, [api, queryClient, restoreAttempt]);
  function toggleLocale() {
    const next = locale === "my" ? "en" : "my";
    fallbackLocale = next;
    try {
      localStorage.setItem("paymentDesk.language", next);
    } catch {
      /* Storage is optional. */
    }
    window.dispatchEvent(new Event("paymentdesk-locale"));
  }
  async function logout() {
    await api.logout();
    await queryClient.cancelQueries();
    queryClient.clear();
    setSession(null);
    setLoginError(null);
  }
  function passwordDone() {
    void queryClient.cancelQueries();
    queryClient.clear();
    setSession(null);
    setLoginError(null);
    setPasswordChanged(true);
  }
  return (
    <QueryClientProvider client={queryClient}>
      {oauthError ? (
        <div className="mx-auto max-w-xl px-5 pt-5">
          <ErrorNotice error={oauthError} t={t} />
          <button
            className="secondary mt-2"
            onClick={() => setOauthError(null)}
          >
            {t("close")}
          </button>
        </div>
      ) : null}
      <a
        href="#main-content"
        className="sr-only fixed z-50 bg-white p-4 focus:not-sr-only"
      >
        {t("navCheck")}
      </a>
      {loading || bootstrapError ? (
        <main
          id="session-loading"
          className="mx-auto max-w-lg space-y-5 px-5 py-20"
        >
          <Brand />
          <p role="status">
            {t(loading ? "restoringSession" : "restoreFailed")}
          </p>
          <ErrorNotice error={bootstrapError} t={t} />
          {bootstrapError ? (
            <button
              className="primary"
              id="retry-session"
              onClick={() => setRestoreAttempt((value) => value + 1)}
            >
              {t("retrySession")}
            </button>
          ) : null}
        </main>
      ) : !session ? (
        <>
          <header className="flex min-h-20 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-10">
            <Brand />
            <button
              id="language-toggle"
              onClick={toggleLocale}
              className="secondary"
            >
              <Icon name="languages" />
              {t("switchLanguage")}
            </button>
          </header>
          {passwordChanged ? (
            <p
              id="password-changed"
              className="notice mx-auto mt-5 max-w-md"
              role="status"
            >
              {t("passwordChanged")}
            </p>
          ) : null}
          <Login
            api={api}
            t={t}
            error={loginError}
            onLogin={(user) => {
              setLoginError(null);
              setPasswordChanged(false);
              setSession({ user, id: Date.now() });
            }}
          />
        </>
      ) : session.user.mustChangePassword ? (
        <main
          id="required-password-change"
          className="mx-auto max-w-lg space-y-6 px-5 py-12"
        >
          <Brand />
          <h1>{t("changePassword")}</h1>
          <ChangePassword api={api} t={t} onDone={passwordDone} required />
          <button
            className="secondary"
            onClick={() => void logout().catch(setBootstrapError)}
          >
            {t("signOut")}
          </button>
        </main>
      ) : (
        <Workspace
          key={session.id}
          api={api}
          user={session.user}
          sessionId={session.id}
          t={t}
          onToggleLocale={toggleLocale}
          onLogout={logout}
          onPasswordChanged={passwordDone}
        />
      )}
    </QueryClientProvider>
  );
}
export function Brand() {
  return (
    <a
      className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-ink"
      href="#main-content"
      aria-label="Payment Desk"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Icon name="scan-line" />
      </span>
      <span>
        Payment<span className="font-normal text-slate-500">Desk</span>
      </span>
    </a>
  );
}
