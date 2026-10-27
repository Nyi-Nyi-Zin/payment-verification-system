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
import { ROLES_KEY } from "./auth.decorators";
import { AuthenticatedUser } from "./auth.types";

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
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

    try {
      const payload = this.jwtService.verify<
        AuthenticatedUser & { tokenType?: string }
      >(token);
      if (
        payload.tokenType !== "access" ||
        !payload.id ||
        !Object.values(UserRole).includes(payload.role)
      ) {
        throw new UnauthorizedException("Invalid authentication payload");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });
      if (!user || user.status !== "ACTIVE")
        throw new UnauthorizedException("User is inactive");
      request.user = {
        id: user.id,
        role: user.role,
        emailOrPhone: user.emailOrPhone,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired bearer token");
    }
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
