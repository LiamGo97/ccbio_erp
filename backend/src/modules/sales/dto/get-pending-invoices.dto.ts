import { IsOptional, IsInt, IsString, Min, IsDateString, IsBoolean, IsIn, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === '') return [];
  if (Array.isArray(value)) {
    const arr = value.map((v) => String(v).trim()).filter((v) => v.length > 0);
    return arr.length ? arr : [];
  }
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()];
  return undefined;
}

function toIntArray(value: unknown): number[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  const nums = raw.map((v) => parseInt(String(v), 10)).filter((n) => !Number.isNaN(n));
  return nums.length ? nums : [];
}

export class GetPendingInvoicesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  smsStatus?: string;

  /** SMS 발송 상태 다중 필터 (반복 쿼리: smsStatuses=a&smsStatuses=b). 빈 배열이면 결과 없음 */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  smsStatuses?: string[];

  @IsOptional()
  @IsString()
  ecountProcessingStatus?: string;

  /** 이카운트 처리 다중 필터 */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  ecountProcessingStatuses?: string[];

  @IsOptional()
  @IsDateString()
  issuedAtStartDate?: string;

  @IsOptional()
  @IsDateString()
  issuedAtEndDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number; // 0 = 미지정(NULL), >0 = 특정 공급자

  /** 공급자 다중 필터 (0 = 미지정). 빈 배열이면 결과 없음 */
  @IsOptional()
  @Transform(({ value }) => toIntArray(value))
  @IsArray()
  @IsInt({ each: true })
  supplierIds?: number[];

  /** true면 취소/판매취소 건 제외 (기본 false = 전체 표시) */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @Type(() => Boolean)
  @IsBoolean()
  excludeCancelled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['invoiceNumber', 'customerName', 'supplier', 'issuedAt', 'items', 'invoiceAmount', 'issuedByUser', 'smsStatus', 'ecountProcessingStatus'])
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc', 'ASC', 'DESC'])
  sortOrder?: string;
}


