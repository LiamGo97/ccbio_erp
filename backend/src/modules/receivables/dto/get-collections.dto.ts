import { IsOptional, IsString, IsInt, Min, Max, IsDateString, IsIn, IsArray } from 'class-validator';
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

/** 수금 목록 API 정렬 컬럼 (프론트 DataTable accessorKey 와 동일) */
export const COLLECTION_LIST_SORT_FIELDS = [
  'collectionDate',
  'collectionNumber',
  'companyName',
  'ceo',
  'collectionAmount',
  'collectionMethod',
  'isPrepayment',
  'notes',
  'createdAt',
] as const;

export type CollectionListSortField = (typeof COLLECTION_LIST_SORT_FIELDS)[number];

export const COLLECTION_PREPAYMENT_FILTER_VALUES = ['all', 'prepayment', 'normal'] as const;
export type CollectionPrepaymentFilter = (typeof COLLECTION_PREPAYMENT_FILTER_VALUES)[number];

export class GetCollectionsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** 전체 | 선수금만 | 일반만 */
  @IsOptional()
  @IsString()
  @IsIn([...COLLECTION_PREPAYMENT_FILTER_VALUES])
  prepaymentFilter?: CollectionPrepaymentFilter;

  @IsOptional()
  @IsString()
  @IsIn([...COLLECTION_LIST_SORT_FIELDS])
  sortBy?: CollectionListSortField;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  /** SMS 발송 상태 다중 필터 (smsStatuses=a&smsStatuses=b). 빈 배열이면 결과 없음 */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  smsStatuses?: string[];
}
