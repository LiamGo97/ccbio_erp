import { IsNumber, IsString, IsDateString, IsOptional, IsBoolean } from 'class-validator';

export class CollectReceivableDto {
  @IsNumber()
  // 음수 허용 (환불 처리용)
  collectionAmount!: number;

  @IsDateString({}, { message: '수금일은 유효한 날짜 형식이어야 합니다.' })
  collectionDate!: string;

  @IsString()
  @IsOptional()
  collectionMethod?: string | null;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @IsBoolean()
  @IsOptional()
  isPrepayment?: boolean;
}
