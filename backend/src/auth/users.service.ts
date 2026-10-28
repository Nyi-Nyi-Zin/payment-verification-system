import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { PrismaService } from "../database.prisma";
import { CreateUserDto, UpdateUserDto } from "./users.dto";
import { activeUser, lockUser, revokeSessions } from "./session.helpers";
import { AuthenticatedUser } from "./auth.types";

const selection = {
  id: true,
  displayName: true,
  emailOrPhone: true,
  role: true,
  status: true,
  mustChangePassword: true,
  tempPasswordExpiresAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async list(page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new BadRequestException("Invalid page");
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: selection,
        skip: (page - 1) * 50,
        take: 50,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
      this.prisma.user.count(),
    ]);
    return { items, total, page, pageSize: 50 };
  }
  private async authorize(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
  ) {
    // Serializes privilege changes and prevents two Admins removing one another.
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(86291029)");
    const user = await tx.user.findUnique({ where: { id: actor.id } });
    activeUser(user);
    const session = await tx.authSession.findUnique({
      where: { id: actor.sessionId! },
    });
    if (
      user.role !== "ADMIN" ||
      user.mustChangePassword ||
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new ForbiddenException("Active Administrator session required");
  }
  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const temporaryPassword = randomBytes(18).toString("base64url");
    const passwordHash = await hash(temporaryPassword, 12);
    const tempPasswordExpiresAt = new Date(Date.now() + 86400000);
    try {
      const user = await this.prisma.$transaction(
        async (tx) => {
          await this.authorize(tx, actor);
          const created = await tx.user.create({
            data: {
              ...dto,
              passwordHash,
              mustChangePassword: true,
              tempPasswordExpiresAt,
            },
            select: selection,
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: "USER_CREATED",
              entityType: "User",
              entityId: created.id,
              newValueJson: { role: dto.role, status: "ACTIVE" },
            },
          });
          return created;
        },
        { timeout: 15000 },
      );
      return { user, temporaryPassword, expiresAt: tempPasswordExpiresAt };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("This email or phone is already in use");
      throw error;
    }
  }
  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    if (!Object.keys(dto).length)
      throw new BadRequestException("No account changes supplied");
    if (
      id === actor.id &&
      (dto.status === "INACTIVE" || (dto.role && dto.role !== "ADMIN"))
    )
      throw new BadRequestException("You cannot deactivate or demote yourself");
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorize(tx, actor);
        await lockUser(tx, id);
        const before = await tx.user.findUnique({ where: { id } });
        if (!before) throw new NotFoundException("User not found");
        if (
          before.role === "ADMIN" &&
          before.status === "ACTIVE" &&
          (dto.status === "INACTIVE" || (dto.role && dto.role !== "ADMIN"))
        ) {
          const admins = await tx.user.count({
            where: { role: "ADMIN", status: "ACTIVE" },
          });
          if (admins <= 1)
            throw new ConflictException(
              "At least one active Administrator must remain",
            );
        }
        const user = await tx.user.update({
          where: { id },
          data: dto,
          select: selection,
        });
        if (user.role !== before.role || user.status !== before.status)
          await revokeSessions(tx, id, actor.id, "ACCOUNT_PERMISSIONS_CHANGED");
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: "USER_UPDATED",
            entityType: "User",
            entityId: id,
            oldValueJson: {
              role: before.role,
              status: before.status,
              displayName: before.displayName,
            },
            newValueJson: {
              role: user.role,
              status: user.status,
              displayName: user.displayName,
            },
          },
        });
        return user;
      },
      { timeout: 15000 },
    );
  }
  async resetPassword(id: string, actor: AuthenticatedUser) {
    if (id === actor.id)
      throw new BadRequestException("Use Change password for your own account");
    const temporaryPassword = randomBytes(18).toString("base64url");
    const passwordHash = await hash(temporaryPassword, 12);
    const expiresAt = new Date(Date.now() + 86400000);
    const user = await this.prisma.$transaction(
      async (tx) => {
        await this.authorize(tx, actor);
        await lockUser(tx, id);
        if (!(await tx.user.findUnique({ where: { id } })))
          throw new NotFoundException("User not found");
        const updated = await tx.user.update({
          where: { id },
          data: {
            passwordHash,
            mustChangePassword: true,
            tempPasswordExpiresAt: expiresAt,
            refreshTokenHash: null,
          },
          select: selection,
        });
        await revokeSessions(tx, id, actor.id, "PASSWORD_RESET");
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: "PASSWORD_RESET",
            entityType: "User",
            entityId: id,
          },
        });
        return updated;
      },
      { timeout: 15000 },
    );
    return { user, temporaryPassword, expiresAt };
  }
}
