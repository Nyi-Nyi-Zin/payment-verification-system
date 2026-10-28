import { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { validateNewPassword } from "../src/auth/session.helpers";
import { AuthService } from "../src/auth/auth.service";

describe("AuthService", () => {
  it("issues access and refresh tokens after valid login", async () => {
    const passwordHash = await hash("correct-password", 4);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          role: UserRole.ADMIN,
          emailOrPhone: "admin@example.com",
          status: "ACTIVE",
          passwordHash,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce("access-token")
        .mockResolvedValueOnce("refresh-token"),
    };
    Object.assign(prisma, {
      $transaction: (work: (tx: unknown) => unknown) =>
        work({
          ...prisma,
          $queryRawUnsafe: jest.fn(),
          authSession: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn().mockResolvedValue({}),
          },
        }),
    });
    const config = {
      getOrThrow: jest.fn().mockReturnValue("refresh-secret"),
    };
    Object.assign(prisma.user, { findFirst: prisma.user.findUnique });
    const service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
    );

    const result = await service.login({
      emailOrPhone: "admin@example.com",
      password: "correct-password",
    });

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(result.user).toMatchObject({ id: "user-1", role: UserRole.ADMIN });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
  });

  it("rejects new passwords that bcrypt would silently truncate", () => {
    expect(() => validateNewPassword("a".repeat(73))).toThrow();
    expect(() => validateNewPassword("က".repeat(25))).toThrow();
    expect(() => validateNewPassword("x".repeat(11))).toThrow();
    expect(() => validateNewPassword("က".repeat(24))).not.toThrow();
    expect(() => validateNewPassword(" a valid password ")).not.toThrow();
  });

  it("rejects invalid credentials without issuing tokens", async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const jwt = { signAsync: jest.fn() };
    const config = { getOrThrow: jest.fn() };
    const service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
    );

    await expect(
      service.login({
        emailOrPhone: "missing@example.com",
        password: "bad-password",
      }),
    ).rejects.toThrow("Invalid credentials");
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
