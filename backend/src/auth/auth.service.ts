import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, User } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { PrismaService } from "../database.prisma";
import { AuthenticatedUser } from "./auth.types";
import {
  ChangePasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from "./auth.dto";
import {
  activeUser,
  digest,
  identity,
  lockUser,
  revokeSessions,
  validateNewPassword,
} from "./session.helpers";

interface TokenPayload {
  id: string;
  sid: string;
  tokenType: "access" | "refresh";
}
export type ClientType = "api" | "browser";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}
  async register(dto: RegisterDto, clientType: ClientType = "api") {
    validateNewPassword(dto.password);
    const passwordHash = await hash(dto.password, 12);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const user = await tx.user.create({
            data: {
              displayName: dto.displayName.trim(),
              emailOrPhone: dto.emailOrPhone.trim().toLowerCase(),
              passwordHash,
              role: "OPERATOR",
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: user.id,
              action: "ACCOUNT_REGISTERED",
              entityType: "User",
              entityId: user.id,
            },
          });
          return this.createSession(tx, user, clientType);
        },
        { timeout: 15000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "An account already exists. Sign in instead.",
        );
      throw error;
    }
  }
  async googleLogin(
    profile: { sub: string; email: string; name?: string },
    link?: { id: string; sid: string },
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Serialize first Google logins and linking for this Google identity.
          await tx.$executeRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            profile.sub,
          );
          let user = await tx.user.findUnique({
            where: { googleSubject: profile.sub },
          });
          if (link) {
            await lockUser(tx, link.id);
            const current = await tx.user.findUnique({
              where: { id: link.id },
            });
            activeUser(current);
            const session = await tx.authSession.findUnique({
              where: { id: link.sid },
            });
            if (
              !session ||
              session.userId !== current.id ||
              session.clientType !== "browser" ||
              session.revokedAt ||
              session.expiresAt <= new Date() ||
              current.mustChangePassword
            )
              throw new UnauthorizedException(
                "Sign in again before connecting Google",
              );
            if (
              current.emailOrPhone.toLowerCase() !==
                profile.email.toLowerCase() ||
              (user && user.id !== current.id) ||
              (current.googleSubject && current.googleSubject !== profile.sub)
            )
              throw new ConflictException(
                "Google email must match your signed-in account",
              );
            user = await tx.user.update({
              where: { id: current.id },
              data: { googleSubject: profile.sub },
            });
            await tx.auditLog.create({
              data: {
                actorUserId: user.id,
                action: "GOOGLE_CONNECTED",
                entityType: "User",
                entityId: user.id,
              },
            });
          } else if (!user) {
            const existing = await tx.user.findFirst({
              where: {
                emailOrPhone: { equals: profile.email, mode: "insensitive" },
              },
            });
            if (existing)
              throw new ConflictException(
                "Sign in with your password, then connect Google to this account",
              );
            user = await tx.user.create({
              data: {
                role: "OPERATOR",
                emailOrPhone: profile.email.toLowerCase(),
                displayName: (profile.name || profile.email).slice(0, 100),
                googleSubject: profile.sub,
              },
            });
            await tx.auditLog.create({
              data: {
                actorUserId: user.id,
                action: "ACCOUNT_REGISTERED_GOOGLE",
                entityType: "User",
                entityId: user.id,
              },
            });
          }
          await lockUser(tx, user.id);
          const current = await tx.user.findUnique({ where: { id: user.id } });
          activeUser(current);
          return this.createSession(tx, current, "browser");
        },
        { timeout: 15000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Account already exists. Sign in with your password and connect Google.",
        );
      throw error;
    }
  }
  private async createSession(
    tx: Prisma.TransactionClient,
    user: User,
    clientType: ClientType,
  ) {
    await revokeSessions(tx, user.id, user.id, "REPLACEMENT_LOGIN");
    const sid = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const tokens = await this.issueTokens(identity(user), sid, expiresAt);
    await tx.authSession.create({
      data: {
        id: sid,
        userId: user.id,
        clientType,
        expiresAt,
        refreshHash: digest(tokens.refreshToken),
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: null, lastLoginAt: new Date() },
    });
    return { ...tokens, user: identity(user), expiresAt };
  }
  async login(dto: LoginDto, clientType: ClientType = "api") {
    const user = await this.prisma.user.findFirst({
      where: {
        emailOrPhone: { equals: dto.emailOrPhone.trim(), mode: "insensitive" },
      },
    });
    const valid = await compare(
      dto.password,
      user?.passwordHash ||
        "$2b$12$C6UzMDM.H6dfI/f/IKcEe.0rvvP5Q8MGsHkS7ygk1N9vZ8FnO5x7e",
    );
    if (!user || !user.passwordHash || !valid)
      throw new UnauthorizedException("Invalid credentials");
    return this.prisma.$transaction(
      async (tx) => {
        await lockUser(tx, user.id);
        const current = await tx.user.findUnique({ where: { id: user.id } });
        activeUser(current);
        if (current.passwordHash !== user.passwordHash)
          throw new UnauthorizedException(
            "Credentials changed. Sign in again.",
          );
        return this.createSession(tx, current, clientType);
      },
      { timeout: 15000 },
    );
  }
  async refresh(dto: RefreshTokenDto, clientType: ClientType = "api") {
    const payload = await this.verifyRefresh(dto.refreshToken);
    return this.prisma.$transaction(
      async (tx) => {
        await lockUser(tx, payload.id);
        const session = await tx.authSession.findUnique({
          where: { id: payload.sid },
          include: { user: true },
        });
        if (
          !session ||
          session.userId !== payload.id ||
          session.revokedAt ||
          session.expiresAt <= new Date() ||
          session.clientType !== clientType ||
          session.refreshHash !== digest(dto.refreshToken)
        )
          throw new UnauthorizedException("Refresh session is not active");
        activeUser(session.user);
        const tokens = await this.issueTokens(
          identity(session.user),
          session.id,
          session.expiresAt,
        );
        const changed = await tx.authSession.updateMany({
          where: {
            id: session.id,
            refreshHash: digest(dto.refreshToken),
            revokedAt: null,
          },
          data: { refreshHash: digest(tokens.refreshToken) },
        });
        if (!changed.count)
          throw new UnauthorizedException("Refresh token was already used");
        return {
          ...tokens,
          user: identity(session.user),
          expiresAt: session.expiresAt,
        };
      },
      { timeout: 15000 },
    );
  }
  async logout(userId: string, sessionId: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await revokeSessions(tx, userId, userId, "LOGOUT", sessionId);
    });
    return { success: true as const };
  }
  async browserLogout(token?: string) {
    if (token) {
      let payload: TokenPayload;
      try {
        payload = await this.verifyRefresh(token);
      } catch {
        return { success: true as const };
      }
      const session = await this.prisma.authSession.findUnique({
        where: { id: payload.sid },
      });
      if (session?.clientType === "browser" && session.userId === payload.id)
        await this.logout(payload.id, payload.sid);
    }
    return { success: true as const };
  }
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    activeUser(user);
    return identity(user);
  }
  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto) {
    validateNewPassword(dto.newPassword);
    const passwordHash = await hash(dto.newPassword, 12);
    await this.prisma.$transaction(
      async (tx) => {
        await lockUser(tx, user.id);
        const current = await tx.user.findUnique({ where: { id: user.id } });
        activeUser(current);
        const session = await tx.authSession.findUnique({
          where: { id: user.sessionId! },
        });
        if (!session || session.revokedAt || session.expiresAt <= new Date())
          throw new UnauthorizedException("Session ended");
        if (
          !current.passwordHash ||
          !(await compare(dto.currentPassword, current.passwordHash))
        )
          throw new BadRequestException("Current password is incorrect");
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            mustChangePassword: false,
            tempPasswordExpiresAt: null,
            refreshTokenHash: null,
          },
        });
        await revokeSessions(tx, user.id, user.id, "PASSWORD_CHANGED");
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "PASSWORD_CHANGED",
            entityType: "User",
            entityId: user.id,
          },
        });
      },
      { timeout: 15000 },
    );
    return { success: true as const };
  }
  private async verifyRefresh(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        algorithms: ["HS256"],
      });
      if (payload.tokenType !== "refresh" || !payload.id || !payload.sid)
        throw new Error();
      return payload;
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }
  private async issueTokens(
    user: AuthenticatedUser,
    sid: string,
    expiresAt: Date,
  ) {
    const remaining = Math.max(
      1,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );
    const common = {
      id: user.id,
      role: user.role,
      emailOrPhone: user.emailOrPhone,
      sid,
    };
    const accessToken = await this.jwt.signAsync(
      { ...common, tokenType: "access", jti: randomUUID() },
      { expiresIn: Math.min(900, remaining), algorithm: "HS256" },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...common, tokenType: "refresh", jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: remaining,
        algorithm: "HS256",
      },
    );
    return { accessToken, refreshToken };
  }
}
