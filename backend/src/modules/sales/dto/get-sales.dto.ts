import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GetSalesDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** 창고 ID 다중 선택 (입고 창고 기준). 있으면 해당 창고 입고 건만. warehouseFilter=none 이면 결과 없음 */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  warehouseIds?: number[];

  /** 'none' 이면 창고 필터로 결과 없음 (프론트에서 선택 0개일 때 사용) */
  @IsOptional()
  @IsIn(['none'])
  warehouseFilter?: 'none';

  /** true 이면 전체 취소된 판매(sa_cancelled_at 설정된 건)도 목록에 포함 */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @Type(() => Boolean)
  @IsBoolean()
  includeCancelled?: boolean;

  /** BK/BL 검색 (order.bl, order.bk) */
  @IsOptional()
  @IsString()
  bkBl?: string;

  /** 단일 상태 (레거시). statuses 사용 시 무시 */
  @IsOptional()
  @IsString()
  status?: string;

  /** 상태 다중 선택 (sa_status: RESERVED | SOLD | COMPLETED). 프론트는 SALES_ITEM_* 코드로 전달 가능 */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  statuses?: string[];

  /** 'none' 이면 상태 필터로 결과 없음 (프론트에서 선택 0개일 때 사용) */
  @IsOptional()
  @IsIn(['none'])
  statusFilter?: 'none';

  /** 판매 단가 구분(상품 정보 구분 코드). 지정 시 해당 구분의 비취소 판매 항목이 1건 이상인 판매만 */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(30)
  salesUnitPriceStage?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** 날짜 필터 기준: createdAt(등록일) | invoiceIssuedAt(세금계산서 발행일). 기본값: createdAt */
  @IsOptional()
  @IsIn(['createdAt', 'invoiceIssuedAt'])
  dateType?: 'createdAt' | 'invoiceIssuedAt';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['createdAt', 'reservationDate', 'salesDate', 'customerName', 'status'])
  sortBy?: 'createdAt' | 'reservationDate' | 'salesDate' | 'customerName' | 'status';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}










