import { IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetSmsTemplatesDto {
  @IsOptional()
  @IsString()
  type?: string; // 템플릿 타입 필터

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number | null; // 공급자 ID 필터 (null이면 기본 템플릿만)

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number; // 페이지 번호

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number; // 페이지당 개수
}
