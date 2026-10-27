import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";
import { ProviderCode } from "../common/enums/domain.enums";

export class UploadReceiptDto {
  @IsEnum(ProviderCode)
  provider!: ProviderCode;
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  businessDate!: string;
}
export class ReceiptDetailsDto {
  @IsString()
  @Matches(/^\d{1,12}(?:\.\d{1,2})?$/)
  amount!: string;
  @IsOptional()
  @IsString()
  @Length(1, 100)
  transactionId?: string;
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(?::\d{2})?$/)
  time?: string;
  @IsOptional()
  @IsString()
  @Length(1, 200)
  receiver?: string;
}
