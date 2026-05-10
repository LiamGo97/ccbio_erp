import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetSmsDetailDto {
  @IsNotEmpty()
  @IsString()
  mid: string; // 메시지 고유 ID (필수)

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number; // 페이지번호 (기본 1)

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page_size?: number; // 페이지당 출력갯수 (기본 30, 30~500)

  @IsOptional()
  @IsString()
  start_date?: string; // 조회시작일자 (기본 최근일자) YYYYMMDD

  @IsOptional()
  @IsString()
  limit_day?: string; // 조회마감일자 YYYYMMDD
}

