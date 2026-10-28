import { Transform } from "class-transformer";
import { IsEnum, ValidateIf, IsString, Length } from "class-validator";
import { RecordStatus, UserRole } from "@prisma/client";

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  displayName!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(3, 160)
  emailOrPhone!: string;
  @IsEnum(UserRole)
  role!: UserRole;
}
export class UpdateUserDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  displayName?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(UserRole)
  role?: UserRole;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
