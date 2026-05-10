import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateContainerDto {
  @IsOptional()
  @Type(() => Number)
  stoCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  dtCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  workFee?: number | null;

  @IsOptional()
  @Type(() => Number)
  onsiteWorkFee?: number | null;

  /** true: 재고 목록에서 제외, false: 제외 해제(복구) */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  excludeFromInventory?: boolean;

  /** 반납여부 (tb_code CONTAINER_RETURN_STATUS) */
  @IsOptional()
  @IsString()
  @IsIn(['NOT_RETURNED', 'RETURNED', 'LEASED', 'LEASED_ENDED'])
  returnStatus?: 'NOT_RETURNED' | 'RETURNED' | 'LEASED' | 'LEASED_ENDED';

  /** 컨테이너 비고 (재고 확정 등) */
  @IsOptional()
  @IsString()
  notes?: string | null;
}










