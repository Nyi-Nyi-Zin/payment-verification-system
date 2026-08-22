import { IsString, Length } from 'class-validator';

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
