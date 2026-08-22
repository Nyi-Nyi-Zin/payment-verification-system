import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export enum ReviewAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  MARK_DUPLICATE = 'MARK_DUPLICATE',
  REPROCESS_OCR = 'REPROCESS_OCR',
}

export class ResolveReviewDto {
  @IsEnum(ReviewAction)
  action!: ReviewAction;

  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  comment?: string;
}
