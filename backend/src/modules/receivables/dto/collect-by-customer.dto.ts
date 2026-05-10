import { IsNumber, IsString, IsDateString, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CollectByCustomerDto {
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
  prepaymentId?: string | null; // 선입금 신청 ID (선택적, 선입금 신청 확인용)

  @IsString()
  @IsOptional()
  notes?: string | null; // 필요시 거래명세서 번호 기록 가능 (참고용)

  @IsBoolean()
  @IsOptional()
  isPrepayment?: boolean;
}
