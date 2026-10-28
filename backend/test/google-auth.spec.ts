import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";
import { Request, Response } from "express";
import { BrowserAuth } from "../src/auth/browser-auth";
import { GoogleAuth } from "../src/auth/google-auth";

describe("Google sign-in verification", () => {
  const config = new ConfigService({
    GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "synthetic-client-secret",
    GOOGLE_REDIRECT_URI:
      "https://desk.example.com/api/v1/auth/browser/google/callback",
    APP_ORIGINS: "https://desk.example.com",
    NODE_ENV: "production",
  });
  const jwt = new JwtService({
    secret: "synthetic-state-signing-secret-32-characters",
  });
  const create = () => new GoogleAuth(config, jwt, new BrowserAuth(config));
  const request = (extra = {}) =>
    ({
      header: (name: string) =>
        name === "origin" ? "https://desk.example.com" : undefined,
      ...extra,
    }) as Request;
  const response = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
  afterEach(() => jest.restoreAllMocks());

  it("fails closed without complete credentials and rejects untrusted callback origins", () => {
    const missing = new ConfigService({
      APP_ORIGINS: "https://desk.example.com",
      NODE_ENV: "production",
    });
    expect(new GoogleAuth(missing, jwt, new BrowserAuth(missing)).enabled).toBe(
      false,
    );
    expect(
      () =>
        new GoogleAuth(
          new ConfigService({
            GOOGLE_CLIENT_ID: "id",
            GOOGLE_CLIENT_SECRET: "secret",
            GOOGLE_REDIRECT_URI:
              "https://evil.example/api/v1/auth/browser/google/callback",
          }),
          jwt,
          new BrowserAuth(config),
        ),
    ).toThrow();
  });
  it("binds state to a secure HttpOnly cookie, uses PKCE and rejects tampering and expiration", async () => {
    const google = create();
    const res = response();
    const start = await google.start(request(), res as unknown as Response);
    const url = new URL(start.url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(res.cookie.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600000,
    });
    const token = res.cookie.mock.calls[0][1];
    const callback = (signed = token, state = url.searchParams.get("state")) =>
      request({
        headers: { cookie: `paymentdesk_google=${signed}` },
        query: { state },
      });
    const state = await google.consume(callback(), res as unknown as Response);
    expect(state.nonce).toBe(url.searchParams.get("nonce"));
    await expect(
      google.consume(callback(token + "broken"), res as unknown as Response),
    ).rejects.toThrow();
    await expect(
      google.consume(
        callback(token, "a".repeat(64)),
        res as unknown as Response,
      ),
    ).rejects.toThrow();
    const { exp: _exp, iat: _iat, ...expiredState } = jwt.verify(token);
    const expired = await jwt.signAsync(expiredState, {
      noTimestamp: true,
      expiresIn: -1,
    });
    await expect(
      google.consume(callback(expired), res as unknown as Response),
    ).rejects.toThrow();
    await expect(
      google.consume(
        request({ headers: {}, query: {} }),
        res as unknown as Response,
      ),
    ).rejects.toThrow();
  });
  it("verifies the Google signature/audience through the official library and requires a matching nonce and verified email", async () => {
    const google = create();
    const res = response();
    await google.start(request(), res as unknown as Response);
    const state = jwt.verify(res.cookie.mock.calls[0][1]);
    const exchange = jest
      .spyOn(OAuth2Client.prototype, "getToken")
      .mockResolvedValue({
        tokens: { id_token: "synthetic-google-id-token" },
      } as never);
    let payload: Record<string, unknown> = {
      sub: "google-user",
      email: "person@gmail.com",
      email_verified: true,
      nonce: state.nonce,
    };
    const verify = jest
      .spyOn(OAuth2Client.prototype, "verifyIdToken")
      .mockImplementation(async () => ({ getPayload: () => payload }) as never);
    await expect(google.verify("synthetic-code", state)).resolves.toMatchObject(
      { sub: "google-user", email: "person@gmail.com" },
    );
    expect(exchange).toHaveBeenCalledWith(
      expect.objectContaining({ codeVerifier: state.verifier }),
    );
    expect(verify).toHaveBeenCalledWith({
      idToken: "synthetic-google-id-token",
      audience: "test.apps.googleusercontent.com",
    });
    for (const change of [
      { email_verified: false },
      { nonce: "wrong-nonce" },
      { sub: "" },
      { email: "" },
    ]) {
      payload = {
        sub: "google-user",
        email: "person@gmail.com",
        email_verified: true,
        nonce: state.nonce,
        ...change,
      };
      await expect(google.verify("code", state)).rejects.toThrow();
    }
    verify.mockImplementation((async () => {
      throw new Error("Invalid signature or audience");
    }) as never);
    await expect(google.verify("code", state)).rejects.toThrow();
  });
});
