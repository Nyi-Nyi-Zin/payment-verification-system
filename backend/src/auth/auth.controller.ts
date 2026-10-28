import {
  Body,
  Controller,
  ConflictException,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { JwtAuthGuard } from "./auth.guards";
import { AuthenticatedUser } from "./auth.types";
import {
  ChangePasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from "./auth.dto";
import { GoogleAuth } from "./google-auth";
import { AuthService, ClientType } from "./auth.service";
import { LoginThrottle } from "./login-throttle";
import { BrowserAuth } from "./browser-auth";
import { AllowPasswordChange } from "./auth.decorators";

type UserRequest = Request & { user: AuthenticatedUser };
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly throttle: LoginThrottle,
    private readonly browser: BrowserAuth,
    private readonly google: GoogleAuth,
  ) {}
  @Get("options")
  options() {
    return { google: this.google.enabled };
  }
  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() request: Request) {
    await this.throttle.publicAttempt(request.ip || "unknown", "register");
    return this.auth.register(dto);
  }
  @Post("browser/register")
  async browserRegister(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.check(request);
    await this.throttle.publicAttempt(request.ip || "unknown", "register");
    const result = await this.auth.register(dto, "browser");
    this.browser.set(response, result.refreshToken, result.expiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Post("browser/google/start")
  async googleStart(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.check(request);
    await this.throttle.publicAttempt(request.ip || "unknown", "google");
    return this.google.start(request, response);
  }
  @UseGuards(JwtAuthGuard)
  @Post("browser/google/link")
  async googleLink(
    @Req() request: UserRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.check(request);
    await this.throttle.publicAttempt(request.ip || "unknown", "google");
    return this.google.start(request, response, {
      id: request.user.id,
      sid: request.user.sessionId!,
    });
  }
  @Get("browser/google/callback")
  async googleCallback(@Req() request: Request, @Res() response: Response) {
    response.setHeader("Referrer-Policy", "no-referrer");
    try {
      const state = await this.google.consume(request, response);
      if (request.query.error) return response.redirect("/#oauth=cancelled");
      const profile = await this.google.verify(request.query.code, state);
      const result = await this.auth.googleLogin(profile, state.link);
      this.browser.set(response, result.refreshToken, result.expiresAt);
      return response.redirect("/#oauth=success");
    } catch (error) {
      return response.redirect(
        error instanceof ConflictException
          ? "/#oauth=account_exists"
          : "/#oauth=failed",
      );
    }
  }
  private async signIn(dto: LoginDto, request: Request, type: ClientType) {
    const ip = request.ip || "unknown";
    await this.throttle.check(ip);
    try {
      return await this.auth.login(dto, type);
    } catch (error) {
      if (error instanceof UnauthorizedException)
        await this.throttle.failed(ip);
      throw error;
    }
  }
  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.signIn(dto, request, "api");
  }
  @Post("refresh")
  async refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    await this.throttle.refresh(request.ip || "unknown");
    return this.auth.refresh(dto);
  }
  @Post("browser/login")
  async browserLogin(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.check(request);
    const result = await this.signIn(dto, request, "browser");
    this.browser.set(response, result.refreshToken, result.expiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Post("browser/refresh")
  async browserRefresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.check(request);
    await this.throttle.refresh(request.ip || "unknown");
    const token = this.browser.token(request);
    if (!token) throw new UnauthorizedException("No browser session");
    const result = await this.auth.refresh({ refreshToken: token }, "browser");
    this.browser.set(response, result.refreshToken, result.expiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Post("browser/logout")
  async browserLogout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.browser.check(request);
    const result = await this.auth.browserLogout(this.browser.token(request));
    this.browser.clear(response);
    return result;
  }
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChange()
  @Get("me")
  me(@Req() request: UserRequest) {
    return this.auth.me(request.user.id);
  }
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChange()
  @Post("logout")
  logout(@Req() request: UserRequest) {
    return this.auth.logout(request.user.id, request.user.sessionId!);
  }
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChange()
  @Post("change-password")
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() request: UserRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.changePassword(request.user, dto);
    this.browser.clear(response);
    return result;
  }
}
