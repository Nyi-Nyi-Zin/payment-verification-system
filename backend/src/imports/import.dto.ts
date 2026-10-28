import { IsDateString, IsEnum, IsIn, IsOptional } from "class-validator";
import { ProviderCode } from "../common/enums/domain.enums";

export class CreateImportDto {
  @IsEnum(ProviderCode)
  provider!: ProviderCode;

  @IsDateString()
  businessDate!: string;

  @IsOptional()
  @IsIn(["day", "statement"])
  scope?: "day" | "statement";
}
