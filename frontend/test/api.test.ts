import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient, ApiError } from "../src/lib/api";
import { QueryClient } from "@tanstack/react-query";

const session = {
  accessToken: "access",
  refreshToken: "refresh",
  user: { role: "ADMIN", emailOrPhone: "synthetic@example.test" },
};

test("anonymous restoration is quiet and browser refresh sends no readable credential", async () => {
  const previous = globalThis.fetch;
  let expired = false;
  globalThis.fetch = async (input, options) => {
    assert.ok(String(input).endsWith("/auth/browser/refresh"));
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.body, "{}");
    assert.equal(new Headers(options?.headers).has("Authorization"), false);
    return response({}, 401);
  };
  try {
    const api = new ApiClient();
    api.subscribeExpired(() => {
      expired = true;
    });
    assert.equal(await api.restore(), null);
    assert.equal(expired, false);
  } finally {
    globalThis.fetch = previous;
  }
});

test("forbidden responses and refresh network failures preserve the signed-in session", async () => {
  const previous = globalThis.fetch;
  let expired = false;
  let mode = "forbidden";
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/login")) return response(session);
    if (String(input).endsWith("/refresh")) throw new TypeError("offline");
    if (mode === "ok") return response({ ok: true });
    return response({}, mode === "forbidden" ? 403 : 401);
  };
  try {
    const api = new ApiClient();
    api.subscribeExpired(() => {
      expired = true;
    });
    await api.login({
      emailOrPhone: "synthetic@example.test",
      password: "synthetic-password",
    });
    await assert.rejects(
      api.request("/users"),
      (error: unknown) =>
        error instanceof ApiError && error.code === "FORBIDDEN",
    );
    mode = "expired";
    await assert.rejects(
      api.request("/dashboard"),
      (error: unknown) =>
        error instanceof ApiError && error.code === "NETWORK_ERROR",
    );
    assert.equal(expired, false);
    mode = "ok";
    assert.deepEqual(await api.request("/dashboard"), { ok: true });
  } finally {
    globalThis.fetch = previous;
  }
});

test("failed logout retains the session so the user can retry server revocation", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/login")) return response(session);
    if (String(input).endsWith("/logout")) throw new TypeError("offline");
    return response({ ok: true });
  };
  try {
    const api = new ApiClient();
    await api.login({
      emailOrPhone: "synthetic@example.test",
      password: "synthetic-password",
    });
    await assert.rejects(
      api.logout(),
      (error: unknown) =>
        error instanceof ApiError && error.code === "NETWORK_ERROR",
    );
    assert.deepEqual(await api.request("/dashboard"), { ok: true });
  } finally {
    globalThis.fetch = previous;
  }
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

test("concurrent unauthorized requests share one refresh and retry with the new access token", async () => {
  const previous = globalThis.fetch;
  let refreshes = 0;
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith("/login")) return response(session);
    if (String(input).endsWith("/refresh")) {
      refreshes++;
      await Promise.resolve();
      return response({
        accessToken: "rotated",
        user: session.user,
      });
    }
    return new Headers(options?.headers).get("Authorization") ===
      "Bearer rotated"
      ? response({ ok: true })
      : response({}, 401);
  };
  try {
    const api = new ApiClient();
    await api.login({ emailOrPhone: "a", password: "b" });
    assert.deepEqual(
      await Promise.all([api.request("/one"), api.request("/two")]),
      [{ ok: true }, { ok: true }],
    );
    assert.equal(refreshes, 1);
  } finally {
    globalThis.fetch = previous;
  }
});

test("an old response cannot resolve into a new session", async () => {
  const previous = globalThis.fetch;
  const pending = deferred<Response>();
  globalThis.fetch = async (input) =>
    String(input).endsWith("/login") ? response(session) : pending.promise;
  try {
    const api = new ApiClient();
    await api.login({ emailOrPhone: "a", password: "b" });
    const request = api.request("/old");
    api.clear();
    await api.login({ emailOrPhone: "new", password: "b" });
    pending.resolve(response({ privateData: true }));
    await assert.rejects(
      request,
      (error: unknown) =>
        error instanceof ApiError && error.code === "SESSION_EXPIRED",
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("refresh rejection expires the session and cache cleanup removes private records", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith("/login") ? response(session) : response({}, 401);
  try {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["session", 1, "detail"], { private: true });
    const api = new ApiClient();
    api.subscribeExpired(() => client.clear());
    await api.login({ emailOrPhone: "a", password: "b" });
    await assert.rejects(
      api.request("/dashboard"),
      (error: unknown) =>
        error instanceof ApiError && error.code === "SESSION_EXPIRED",
    );
    assert.equal(client.getQueryCache().getAll().length, 0);
    client.clear();
  } finally {
    globalThis.fetch = previous;
  }
});

test("cancelled query requests use the caller signal without becoming a network failure", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (_input, options) =>
    new Promise((_resolve, reject) =>
      options?.signal?.addEventListener(
        "abort",
        () => reject(options.signal?.reason),
        { once: true },
      ),
    );
  try {
    const api = new ApiClient();
    const controller = new AbortController();
    const pending = api.request("/dashboard", { signal: controller.signal });
    controller.abort();
    await assert.rejects(
      pending,
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("an old error body cannot expire the newly signed-in session", async () => {
  const previous = globalThis.fetch;
  const started = deferred<void>();
  const body = deferred<object>();
  let expired = false;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/login")) return response(session);
    const error = response({}, 403);
    error.json = async () => {
      started.resolve();
      return body.promise;
    };
    return error;
  };
  try {
    const api = new ApiClient();
    api.subscribeExpired(() => {
      expired = true;
    });
    await api.login({ emailOrPhone: "a", password: "b" });
    const pending = api.request("/old-error");
    await started.promise;
    api.clear();
    await api.login({ emailOrPhone: "new", password: "b" });
    body.resolve({ message: "Old response" });
    await assert.rejects(
      pending,
      (error: unknown) =>
        error instanceof ApiError && error.code === "SESSION_EXPIRED",
    );
    assert.equal(expired, false);
  } finally {
    globalThis.fetch = previous;
  }
});
