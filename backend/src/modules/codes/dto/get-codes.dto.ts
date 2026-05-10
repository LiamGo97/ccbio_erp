import { IsString, IsOptional, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GetCodesDto {
  @IsString()
  @IsOptional()
  group?: string; // 코드 그룹으로 필터링

  @IsString()
  @IsOptional()
  code?: string; // 호환성을 위한 파라미터 (group으로 변환됨)

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  parentId?: number; // 부모 ID로 필터링

  @IsString()
  @IsOptional()
  search?: string; // 검색어

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
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';

  @IsString()
  @IsOptional()
  sortBy?: string;
}


