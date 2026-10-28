import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { BrowserAuth } from "../src/auth/browser-auth";

describe("Browser authentication boundary", () => {
  const config = new ConfigService({
    NODE_ENV: "production",
    APP_ORIGINS: "https://desk.example.com",
  });
  it("requires exact configured HTTPS origins in production", () => {
    expect(
      () => new BrowserAuth(new ConfigService({ NODE_ENV: "production" })),
    ).toThrow();
    expect(
      () =>
        new BrowserAuth(
          new ConfigService({
            NODE_ENV: "production",
            APP_ORIGINS: "http://desk.example.com",
          }),
        ),
    ).toThrow();
    const browser = new BrowserAuth(config);
    for (const origin of [
      "https://attacker.example",
      "https://desk.example.com.attacker.example",
      undefined,
    ])
      expect(() =>
        browser.check({
          header: (name: string) => (name === "origin" ? origin : undefined),
        } as Request),
      ).toThrow();
    expect(() =>
      browser.check({
        header: (name: string) =>
          name === "origin" ? "https://desk.example.com" : undefined,
      } as Request),
    ).not.toThrow();
  });
  it("sets and clears matching secure, HttpOnly, same-site cookies without a domain", () => {
    const browser = new BrowserAuth(config);
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const expiry = new Date(Date.now() + 86400000);
    browser.set(response as unknown as Response, "synthetic-token", expiry);
    expect(response.cookie).toHaveBeenCalledWith(
      "paymentdesk_refresh",
      "synthetic-token",
      {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/api/v1/auth",
        expires: expiry,
      },
    );
    browser.clear(response as unknown as Response);
    expect(response.clearCookie).toHaveBeenCalledWith("paymentdesk_refresh", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/v1/auth",
    });
  });
});
