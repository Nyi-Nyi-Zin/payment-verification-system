import { LoginThrottle } from "./login-throttle";
import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "./auth.guards";
import { AuthenticatedUser } from "./auth.types";
import { LoginDto, RefreshTokenDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly throttle: LoginThrottle,
  ) {}

  @Post("login")
  login(@Body() dto: LoginDto, @Req() request: Request) {
    this.throttle.check(request.ip || "unknown");
    return this.authService.login(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    this.throttle.check(request.ip || "unknown");
    return this.authService.refresh(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() request: Request & { user?: AuthenticatedUser }) {
    return this.authService.me(request.user?.id ?? "");
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(@Req() request: Request & { user?: AuthenticatedUser }) {
    return this.authService.logout(request.user?.id ?? "");
  }
}
