"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { loginSchema, type LoginValues } from "@/lib/schemas";
import type { ApiClient } from "@/lib/api";
import type { Translate, User } from "@/lib/types";
import { ErrorNotice, Icon } from "./ui";
import { Register } from "./register";
import { GoogleSignIn } from "./google-sign-in";

export function Login({
  api,
  onLogin,
  t,
  error,
}: {
  api: ApiClient;
  onLogin: (user: User) => void;
  t: Translate;
  error: unknown;
}) {
  const [creating, setCreating] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const login = useMutation({
    mutationFn: (values: LoginValues) => api.login(values),
    onSuccess: (data) => onLogin(data.user),
    gcTime: 0,
  });
  return (
    <main
      id="login-view"
      className="mx-auto grid min-h-[calc(100dvh-80px)] max-w-6xl items-center gap-12 px-5 py-12 md:grid-cols-2 md:px-10 md:py-20"
    >
      <section id="main-content" className="max-w-xl">
        <p className="eyebrow mb-5">{t("loginEyebrow")}</p>
        <h1 className="whitespace-pre-line text-4xl leading-relaxed md:text-5xl">
          {t("loginTitle")}
        </h1>
        <p className="muted mt-5 max-w-lg text-base leading-loose">
          {t("loginIntro")}
        </p>
        <ul className="mt-8 space-y-5">
          {["file-spreadsheet", "images", "scan-line"].map((name, index) => (
            <li key={name} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Icon name={name} />
              </span>
              {t(`loginFeature${index + 1}`)}
            </li>
          ))}
        </ul>
      </section>
      <section
        className="panel mx-auto w-full max-w-md p-6 md:p-9"
        aria-labelledby="login-title"
      >
        <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <Icon name="scan-line" />
        </span>
        <h2 id="login-title" className="text-2xl">
          {t(creating ? "registerAccount" : "welcome")}
        </h2>
        <p className="muted mb-7 mt-2">
          {t(creating ? "registerHelp" : "loginHelp")}
        </p>
        {creating ? (
          <Register api={api} onLogin={onLogin} t={t} />
        ) : (
          <form
            id="login-form"
            onSubmit={handleSubmit((values) => login.mutate(values))}
            noValidate
            className="space-y-5"
          >
            <div>
              <label htmlFor="login-email" className="mb-2 block">
                {t("emailOrPhone")}
              </label>
              <input
                id="login-email"
                autoComplete="username"
                aria-invalid={!!errors.emailOrPhone}
                aria-describedby={
                  errors.emailOrPhone ? "email-error" : undefined
                }
                {...register("emailOrPhone")}
              />
              {errors.emailOrPhone ? (
                <p id="email-error" role="alert" className="form-error">
                  {t(`error.${errors.emailOrPhone.message}`)}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="login-password" className="mb-2 block">
                {t("password")}
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                {...register("password")}
              />
              {errors.password ? (
                <p id="password-error" role="alert" className="form-error">
                  {t(`error.${errors.password.message}`)}
                </p>
              ) : null}
            </div>
            <ErrorNotice error={login.error || error} t={t} />
            <button
              id="login-submit"
              className="primary w-full"
              disabled={login.isPending}
            >
              {t(login.isPending ? "signingIn" : "signIn")}
              <Icon
                name={login.isPending ? "loader-circle" : "arrow-right"}
                spin={login.isPending}
              />
            </button>
          </form>
        )}
        <GoogleSignIn api={api} t={t} />
        <button
          id="toggle-register"
          type="button"
          className="mt-5 w-full text-center text-sm font-semibold text-brand-700"
          disabled={login.isPending}
          onClick={() => {
            setCreating((value) => !value);
            login.reset();
          }}
        >
          {t(creating ? "alreadyRegistered" : "needAccount")}
        </button>
        <p className="muted mt-5 text-center text-xs">{t("accountAccess")}</p>
      </section>
    </main>
  );
}
