import { IsNumber, IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SendReceivableWarningSmsDto {
  @IsNumber()
  @Type(() => Number)
  senderId: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  excludeZeroBalance?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((v) => (typeof v === 'string' ? parseInt(v, 10) : Number(v))).filter((n) => !Number.isNaN(n));
  })
  supplierIds?: number[];

  /** 채권 경고 상태 필터 (화면 필터와 동일). 없으면 1차/2차/3차/악성 전체 */
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const arr = Array.isArray(value) ? value : [value];
    if (arr.includes('__EMPTY__') || arr.length === 0) return [];
    return arr.map((v) => (v === '__null__' || v === 'null' || v === '' ? null : v));
  })
  warningStatus?: (string | null)[];

  /** 고객 구분 필터 (화면 필터와 동일). 없으면 전체 */
  @IsOptional()
  @IsString()
  customerType?: string;

  /** 계산 잔액 구간 (화면과 동일). RECEIVABLE=잔액>0, ZERO=0원, PREPAYMENT=잔액<0 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  balanceCategories?: string[];
}
