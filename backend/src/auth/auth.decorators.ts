import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@prisma/client";

export const ROLES_KEY = "roles";
export const PASSWORD_CHANGE_ALLOWED = "password-change-allowed";
export const AllowPasswordChange = () =>
  SetMetadata(PASSWORD_CHANGE_ALLOWED, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
