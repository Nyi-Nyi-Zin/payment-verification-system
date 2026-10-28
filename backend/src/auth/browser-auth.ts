import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";

@Injectable()
export class BrowserAuth {
  private readonly origins: Set<string>;
  private readonly secure: boolean;
  readonly cookieName = "paymentdesk_refresh";
  constructor(config: ConfigService) {
    this.secure = config.get<string>("NODE_ENV") === "production";
    const configured = config.get<string>("APP_ORIGINS");
    if (this.secure && !configured)
      throw new Error("APP_ORIGINS is required in production");
    const origins = (
      configured ||
      "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    )
      .split(",")
      .map((value) => value.trim());
    for (const value of origins) {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.origin !== value ||
        (this.secure && url.protocol !== "https:")
      )
        throw new Error(
          "APP_ORIGINS must contain exact application origins; production requires HTTPS",
        );
    }
    this.origins = new Set(origins);
  }
  check(request: Request) {
    if (
      !this.origins.has(request.header("origin") || "") ||
      request.header("sec-fetch-site") === "cross-site"
    )
      throw new ForbiddenException("Untrusted application origin");
  }
  token(request: Request) {
    const value = request.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(this.cookieName + "="))
      ?.slice(this.cookieName.length + 1);
    try {
      return value ? decodeURIComponent(value) : undefined;
    } catch {
      return undefined;
    }
  }
  set(response: Response, token: string, expiresAt: Date) {
    response.cookie(this.cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: this.secure,
      path: "/api/v1/auth",
      expires: expiresAt,
    });
  }
  clear(response: Response) {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      sameSite: "strict",
      secure: this.secure,
      path: "/api/v1/auth",
    });
  }
}
