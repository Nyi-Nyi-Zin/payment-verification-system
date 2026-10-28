import { IsString, Length, Matches } from "class-validator";
import { Transform } from "class-transformer";

export class RegisterDto {
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Length(2, 100)
  displayName!: string;

  @IsString()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @Length(3, 160)
  @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+?[0-9]{7,15})$/, {
    message: "Enter a valid email or phone number",
  })
  emailOrPhone!: string;

  @IsString()
  @Length(12, 72)
  password!: string;
}

export class LoginDto {
  @IsString()
  @Length(3, 160)
  emailOrPhone!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  @Length(20, 4096)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(8, 128)
  currentPassword!: string;

  @IsString()
  @Length(12, 72)
  newPassword!: string;
}
