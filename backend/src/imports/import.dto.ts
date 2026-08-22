import { IsDateString, IsEnum } from 'class-validator';
import { ProviderCode } from '../common/enums/domain.enums';

export class CreateImportDto {
  @IsEnum(ProviderCode)
  provider!: ProviderCode;

  @IsDateString()
  businessDate!: string;
}
