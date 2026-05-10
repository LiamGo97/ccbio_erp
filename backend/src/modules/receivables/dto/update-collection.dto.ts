import { IsNumber, IsString, IsDateString, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCollectionDto {
  @IsNumber()
  // 음수 허용 (환불 처리용)
  collectionAmount!: number;

  @IsDateString({}, { message: '수금일은 유효한 날짜 형식이어야 합니다.' })
  collectionDate!: string;

  @IsString()
  @IsOptional()
  collectionMethod?: string | null;

  /** 채권 단위 공급자 지정 (0=공급자 없음, 미전달=변경 안 함) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  supplierId?: number | null;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @IsBoolean()
  @IsOptional()
  isPrepayment?: boolean;
}
