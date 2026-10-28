"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { registerSchema, type RegisterValues } from "@/lib/schemas";
import type { ApiClient } from "@/lib/api";
import type { Translate, User } from "@/lib/types";
import { ErrorNotice, Icon } from "./ui";

export function Register({
  api,
  onLogin,
  t,
}: {
  api: ApiClient;
  onLogin: (user: User) => void;
  t: Translate;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });
  const signup = useMutation({
    mutationFn: (values: RegisterValues) =>
      api.register({
        emailOrPhone: values.emailOrPhone,
        password: values.password,
        displayName: values.displayName,
      }),
    onSuccess: (data) => onLogin(data.user),
    gcTime: 0,
  });
  return (
    <form
      id="register-form"
      className="space-y-5"
      noValidate
      onSubmit={handleSubmit((values) => signup.mutate(values))}
    >
      {(
        ["displayName", "emailOrPhone", "password", "confirmPassword"] as const
      ).map((name) => (
        <div key={name}>
          <label htmlFor={`register-${name}`} className="mb-2 block">
            {t(name === "confirmPassword" ? "registerConfirmPassword" : name)}
          </label>
          <input
            id={`register-${name}`}
            type={name.includes("assword") ? "password" : "text"}
            autoComplete={
              name.includes("assword")
                ? "new-password"
                : name === "displayName"
                  ? "name"
                  : "username"
            }
            aria-invalid={!!errors[name]}
            aria-describedby={
              errors[name]
                ? `register-${name}-error`
                : name === "password"
                  ? "register-policy"
                  : undefined
            }
            disabled={signup.isPending}
            {...register(name)}
          />
          {errors[name] ? (
            <p
              id={`register-${name}-error`}
              role="alert"
              className="form-error"
            >
              {t(`error.${errors[name]?.message}`)}
            </p>
          ) : null}
        </div>
      ))}
      <p id="register-policy" className="muted text-xs">
        {t("passwordPolicy")}
      </p>
      <ErrorNotice error={signup.error} t={t} />
      <button
        id="register-submit"
        className="primary w-full"
        disabled={signup.isPending}
      >
        {t(signup.isPending ? "creatingAccount" : "registerAccount")}
        <Icon
          name={signup.isPending ? "loader-circle" : "arrow-right"}
          spin={signup.isPending}
        />
      </button>
    </form>
  );
}
