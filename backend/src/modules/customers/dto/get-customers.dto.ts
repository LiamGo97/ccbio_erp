import { IsInt, IsIn, IsOptional, IsString, Min, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class GetCustomersDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  region?: string;

  @IsString()
  @IsOptional()
  chamchamStatus?: string;

  @IsString()
  @IsOptional()
  species?: string;

  @IsString()
  @IsOptional()
  operation?: string;

  @IsString()
  @IsOptional()
  operationSub?: string;

  /** 고객 구분 필터: FARM(농가), DISTRIBUTION(유통) */
  @IsString()
  @IsOptional()
  customerType?: string;

  /** 이벤트 SMS 응답 여부 필터 (쿼리: true/false) */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  eventSmsResponded?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  sortBy?: string;

  @IsString()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}


