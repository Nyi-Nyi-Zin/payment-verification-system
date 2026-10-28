import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  emailOrPhone?: string;
  displayName?: string;
  mustChangePassword?: boolean;
  sessionId?: string;
}

export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  ADMIN: [
    "dashboard:read",
    "imports:write",
    "verification:write",
    "review:write",
    "wallet-config:write",
    "reports:read",
    "users:write",
  ],
  REVIEWER: ["dashboard:read", "review:write", "reports:read"],
  OPERATOR: [
    "dashboard:read",
    "imports:write",
    "verification:write",
    "reports:read",
  ],
};
