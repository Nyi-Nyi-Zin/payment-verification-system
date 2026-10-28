import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { BrowserAuth } from "./browser-auth";

interface GoogleState {
  purpose: "google-login";
  state: string;
  nonce: string;
  verifier: string;
  origin: string;
  link?: { id: string; sid: string };
}

@Injectable()
export class GoogleAuth {
  private readonly cookieName = "paymentdesk_google";
  private readonly secure: boolean;
  private readonly client?: OAuth2Client;
  private readonly clientId?: string;
  private readonly redirectUri?: string;
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly browser: BrowserAuth,
  ) {
    this.secure = config.get<string>("NODE_ENV") === "production";
    this.clientId = config.get<string>("GOOGLE_CLIENT_ID");
    const secret = config.get<string>("GOOGLE_CLIENT_SECRET");
    this.redirectUri = config.get<string>("GOOGLE_REDIRECT_URI");
    if (this.clientId && secret && this.redirectUri) {
      const url = new URL(this.redirectUri);
      const origins = (
        config.get<string>("APP_ORIGINS") ||
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
      )
        .split(",")
        .map((value) => value.trim());
      if (
        !origins.includes(url.origin) ||
        url.pathname !== "/api/v1/auth/browser/google/callback" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        (this.secure && url.protocol !== "https:")
      )
        throw new Error(
          "GOOGLE_REDIRECT_URI must be an allowed application origin followed by /api/v1/auth/browser/google/callback",
        );
      this.client = new OAuth2Client({
        clientId: this.clientId,
        clientSecret: secret,
        redirectUri: this.redirectUri,
        transporterOptions: { timeout: 15000 },
      });
    }
  }
  get enabled() {
    return !!this.client;
  }
  private options() {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: "lax" as const,
      path: "/api/v1/auth/browser/google",
    };
  }
  async start(
    request: Request,
    response: Response,
    link?: GoogleState["link"],
  ) {
    this.browser.check(request);
    if (!this.client || !this.redirectUri)
      throw new ServiceUnavailableException("Google sign-in is not configured");
    // The callback must return to the host which owns the state and refresh cookies.
    if (request.header("origin") !== new URL(this.redirectUri).origin)
      throw new ServiceUnavailableException(
        "Open the application at its configured Google sign-in origin",
      );
    const { codeVerifier, codeChallenge } =
      await this.client.generateCodeVerifierAsync();
    const state: GoogleState = {
      purpose: "google-login",
      state: randomBytes(32).toString("hex"),
      nonce: randomBytes(32).toString("hex"),
      verifier: codeVerifier,
      origin: request.header("origin")!,
      ...(link ? { link } : {}),
    };
    const signed = await this.jwt.signAsync(state, {
      expiresIn: 600,
      algorithm: "HS256",
    });
    response.cookie(this.cookieName, signed, {
      ...this.options(),
      maxAge: 600000,
    });
    return {
      url: this.client.generateAuthUrl({
        scope: ["openid", "email", "profile"],
        state: state.state,
        nonce: state.nonce,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        prompt: "select_account",
      }),
    };
  }
  async consume(request: Request, response: Response) {
    response.clearCookie(this.cookieName, this.options());
    if (!this.client || !this.redirectUri)
      throw new UnauthorizedException("Google sign-in is unavailable");
    const cookie = request.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(this.cookieName + "="))
      ?.slice(this.cookieName.length + 1);
    try {
      if (!cookie) throw new Error();
      const state = await this.jwt.verifyAsync<GoogleState>(
        decodeURIComponent(cookie),
        { algorithms: ["HS256"] },
      );
      const queryState = request.query.state;
      if (
        state.purpose !== "google-login" ||
        state.origin !== new URL(this.redirectUri).origin ||
        typeof queryState !== "string" ||
        queryState.length !== state.state.length ||
        !timingSafeEqual(Buffer.from(queryState), Buffer.from(state.state))
      )
        throw new Error();
      return state;
    } catch {
      throw new UnauthorizedException(
        "Invalid or expired Google sign-in. Try again.",
      );
    }
  }
  async verify(code: unknown, state: GoogleState) {
    if (!this.client || typeof code !== "string" || code.length > 4096)
      throw new UnauthorizedException("Invalid Google authorization code");
    try {
      const { tokens } = await this.client.getToken({
        code,
        codeVerifier: state.verifier,
        redirect_uri: this.redirectUri,
      });
      if (!tokens.id_token) throw new Error();
      const ticket = await this.client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (
        !payload?.sub ||
        !payload.email ||
        payload.email.length > 160 ||
        !payload.email_verified ||
        (payload as typeof payload & { nonce?: string }).nonce !== state.nonce
      )
        throw new Error();
      return { sub: payload.sub, email: payload.email, name: payload.name };
    } catch {
      throw new UnauthorizedException(
        "Google could not verify your account. Try again.",
      );
    }
  }
}
