import { PrismaService } from "../database.prisma";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { UserRole } from "@prisma/client";
import { PASSWORD_CHANGE_ALLOWED, ROLES_KEY } from "./auth.decorators";
import { AuthenticatedUser } from "./auth.types";
import { activeUser, identity } from "./session.helpers";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

    if (!token) {
      throw new UnauthorizedException("Bearer token is required");
    }

    let payload: AuthenticatedUser & { tokenType?: string; sid?: string };
    try {
      payload = this.jwtService.verify(token, { algorithms: ["HS256"] });
      if (
        payload.tokenType !== "access" ||
        !payload.id ||
        !payload.sid ||
        !Object.values(UserRole).includes(payload.role)
      ) {
        throw new UnauthorizedException("Invalid authentication payload");
      }
    } catch {
      throw new UnauthorizedException("Invalid or expired bearer token");
    }
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException("Session is no longer active");
    activeUser(session.user);
    if (
      session.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(PASSWORD_CHANGE_ALLOWED, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      throw new ForbiddenException({
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "Change your temporary password before continuing",
      });
    request.user = { ...identity(session.user), sessionId: session.id };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException("Insufficient role for this operation");
    }
    return true;
  }
}
