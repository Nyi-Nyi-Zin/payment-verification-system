import { z } from "zod";
import type { LoginResponse, LoginResponse as Session } from "./types";

export class ApiError extends Error {
  constructor(
    public code: string,
    public details: string | null = null,
  ) {
    super(code);
  }
}
const tokensSchema = z.object({
  accessToken: z.string().min(1),
});
const sessionSchema = tokensSchema.extend({
  user: z.object({
    id: z.string().optional(),
    role: z.enum(["ADMIN", "OPERATOR", "REVIEWER"]),
    emailOrPhone: z.string(),
    displayName: z.string().optional(),
    mustChangePassword: z.boolean().optional(),
    hasPassword: z.boolean().optional(),
    googleLinked: z.boolean().optional(),
  }),
});

/** Per-browser-session client. Credentials never enter storage or React Query keys. */
export class ApiClient {
  private tokens: Session | null = null;
  private generation = 0;
  private controller = new AbortController();
  private refreshing: Promise<Session | null> | null = null;
  private channel: BroadcastChannel | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  connect(onChange: (kind: "login" | "logout") => void) {
    if (typeof BroadcastChannel === "undefined") return () => {};
    const channel = new BroadcastChannel("paymentdesk-auth");
    this.channel = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === "login" || event.data === "logout") {
        this.clear();
        onChange(event.data);
      }
    };
    return () => {
      channel.close();
      if (this.channel === channel) this.channel = null;
    };
  }
  private async lock<T>(work: () => Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request("paymentdesk-auth", work);
    const pending = this.serial.then(work, work);
    this.serial = pending.catch(() => {});
    return pending;
  }
  private onExpired: () => void = () => {};
  subscribeExpired(listener: () => void) {
    this.onExpired = listener;
    return () => {
      this.onExpired = () => {};
    };
  }

  clear() {
    this.generation++;
    this.tokens = null;
    this.controller.abort();
    this.controller = new AbortController();
    this.refreshing = null;
  }
  announceLogin() {
    this.channel?.postMessage("login");
  }
  async login(values: {
    emailOrPhone: string;
    password: string;
  }): Promise<Session> {
    return this.authenticate("login", values);
  }
  async register(values: {
    displayName: string;
    emailOrPhone: string;
    password: string;
  }): Promise<Session> {
    return this.authenticate("register", values);
  }
  private async authenticate(
    action: "login" | "register",
    values: { emailOrPhone: string; password: string; displayName?: string },
  ): Promise<Session> {
    return this.lock(async () => {
      this.clear();
      const result = sessionSchema.safeParse(
        await this.request<LoginResponse>(`/auth/browser/${action}`, {
          method: "POST",
          body: JSON.stringify(values),
        }),
      );
      if (!result.success) throw new ApiError("BAD_RESPONSE");
      this.tokens = result.data;
      this.announceLogin();
      return result.data;
    });
  }
  async google(link = false) {
    const result = await this.request<{ url: string }>(
      `/auth/browser/google/${link ? "link" : "start"}`,
      { method: "POST" },
    );
    const url = new URL(result.url);
    if (url.origin !== "https://accounts.google.com")
      throw new ApiError("BAD_RESPONSE");
    window.location.assign(url.href);
  }
  async restore(): Promise<Session | null> {
    if (!this.refreshing) {
      const pending = this.lock(() => this.refresh(this.generation));
      this.refreshing = pending;
      void pending
        .finally(() => {
          if (this.refreshing === pending) this.refreshing = null;
        })
        .catch(() => {});
    }
    return this.refreshing;
  }
  async logout() {
    await this.lock(async () => {
      await this.request("/auth/browser/logout", { method: "POST" });
      this.clear();
      this.channel?.postMessage("logout");
    });
  }
  async changePassword(values: {
    currentPassword: string;
    newPassword: string;
  }) {
    await this.lock(async () => {
      if (!(await this.refresh(this.generation)))
        throw new ApiError("SESSION_EXPIRED");
      await this.request(
        "/auth/change-password",
        { method: "POST", body: JSON.stringify(values) },
        true,
      );
      this.clear();
      this.channel?.postMessage("logout");
    });
  }
  private async refresh(generation: number): Promise<Session | null> {
    const response = await fetch("/api/v1/auth/browser/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin",
      signal: AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(30000),
      ]),
    }).catch(() => {
      throw new ApiError(
        generation === this.generation ? "NETWORK_ERROR" : "SESSION_EXPIRED",
      );
    });
    if (generation !== this.generation) throw new ApiError("SESSION_EXPIRED");
    if (!response.ok) {
      if (response.status === 401) {
        const wasSignedIn = !!this.tokens;
        this.clear();
        if (wasSignedIn) this.onExpired();
        return null;
      }
      throw new ApiError(
        response.status === 403
          ? "FORBIDDEN"
          : response.status === 429
            ? "RATE_LIMIT"
            : "SERVER_ERROR",
      );
    }
    const parsed = sessionSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (generation !== this.generation) throw new ApiError("SESSION_EXPIRED");
    if (!parsed.success) {
      throw new ApiError("BAD_RESPONSE");
    }
    this.tokens = parsed.data;
    return parsed.data;
  }
  async request<T>(
    path: string,
    options: RequestInit = {},
    retried = false,
  ): Promise<T> {
    const generation = this.generation;
    const headers = new Headers(options.headers);
    if (this.tokens)
      headers.set("Authorization", `Bearer ${this.tokens.accessToken}`);
    if (options.body && !(options.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    const signals = [this.controller.signal, AbortSignal.timeout(120000)];
    if (options.signal) signals.push(options.signal);
    let response: Response;
    try {
      response = await fetch(`/api/v1${path}`, {
        ...options,
        headers,
        signal: AbortSignal.any(signals),
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ApiError(
        generation !== this.generation ? "SESSION_EXPIRED" : "NETWORK_ERROR",
      );
    }
    if (generation !== this.generation) throw new ApiError("SESSION_EXPIRED");
    if (
      response.status === 401 &&
      !path.startsWith("/auth/browser/") &&
      this.tokens &&
      !retried
    ) {
      const refreshed = await this.restore();
      if (!refreshed) throw new ApiError("SESSION_EXPIRED");
      if (generation !== this.generation) throw new ApiError("SESSION_EXPIRED");
      return this.request<T>(path, options, true);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (generation !== this.generation) throw new ApiError("SESSION_EXPIRED");
      const code =
        response.status === 409 && body.code === "UPLOAD_BUSY"
          ? "UPLOAD_BUSY"
          : response.status === 401
            ? path === "/auth/browser/login"
              ? "INVALID_LOGIN"
              : "SESSION_EXPIRED"
            : response.status === 403
              ? "FORBIDDEN"
              : response.status === 409
                ? "CONFLICT"
                : response.status === 429
                  ? "RATE_LIMIT"
                  : response.status >= 500
                    ? "SERVER_ERROR"
                    : "REQUEST_REJECTED";
      if (code === "SESSION_EXPIRED") {
        this.clear();
        this.onExpired();
      }
      const details: string[] = Array.isArray(body.message)
        ? body.message
        : body.message
          ? [String(body.message)]
          : [];
      if (Array.isArray(body.errors))
        details.push(
          ...body.errors
            .slice(0, 20)
            .map(
              (row: { sourceRowNumber: number; errorMessage: string }) =>
                `${row.sourceRowNumber}: ${row.errorMessage}`,
            ),
        );
      throw new ApiError(code, details.join("\n") || null);
    }
    const result = path.endsWith("/image")
      ? await response.blob()
      : response.status === 204
        ? null
        : await response.json().catch(() => {
            throw new ApiError("BAD_RESPONSE");
          });
    if (generation !== this.generation) throw new ApiError("SESSION_EXPIRED");
    return result as T;
  }
}
