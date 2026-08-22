import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ProviderCode } from '../common/enums/domain.enums';

export class UpsertBusinessWalletDto {
  @IsEnum(ProviderCode)
  provider!: ProviderCode;

  @IsString()
  @Length(1, 160)
  accountName!: string;

  @IsOptional()
  @IsString()
  @Length(6, 32)
  phoneNumber?: string;

  @IsOptional()
  @IsBoolean()
  allowOutgoingAutoVerify = false;
}

export class UpsertBusinessWalletBodyDto {
  @IsString()
  @Length(1, 160)
  accountName!: string;

  @IsOptional()
  @IsString()
  @Length(6, 32)
  phoneNumber?: string;

  @IsOptional()
  @IsBoolean()
  allowOutgoingAutoVerify = false;
}

export interface BusinessWalletConfigView {
  provider: ProviderCode;
  accountName: string;
  phoneNumber: string | null;
  allowOutgoingAutoVerify: boolean;
}
