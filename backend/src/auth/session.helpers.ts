import { createHash } from "node:crypto";
import { Prisma, User } from "@prisma/client";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const identity = (user: User) => ({
  id: user.id,
  role: user.role,
  emailOrPhone: user.emailOrPhone,
  displayName: user.displayName,
  mustChangePassword: user.mustChangePassword,
  hasPassword: !!user.passwordHash,
  googleLinked: !!user.googleSubject,
});
export function activeUser(user: User | null): asserts user is User {
  if (
    !user ||
    user.status !== "ACTIVE" ||
    (user.mustChangePassword &&
      (!user.tempPasswordExpiresAt || user.tempPasswordExpiresAt <= new Date()))
  )
    throw new UnauthorizedException(
      "Account or temporary password is inactive",
    );
}
export async function lockUser(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRawUnsafe(
    'SELECT id FROM "User" WHERE id = $1::uuid FOR UPDATE',
    id,
  );
}
export async function revokeSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  actorId: string,
  reason: string,
  sessionId?: string,
) {
  const result = await tx.authSession.updateMany({
    where: { userId, revokedAt: null, ...(sessionId ? { id: sessionId } : {}) },
    data: { revokedAt: new Date() },
  });
  if (result.count)
    await tx.auditLog.create({
      data: {
        actorUserId: actorId,
        action: "SESSIONS_REVOKED",
        entityType: "User",
        entityId: userId,
        reason,
        newValueJson: { count: result.count },
      },
    });
}
export function validateNewPassword(password: string) {
  if ([...password].length < 12 || Buffer.byteLength(password, "utf8") > 72)
    throw new BadRequestException(
      "Password must have at least 12 characters and at most 72 UTF-8 bytes",
    );
}
