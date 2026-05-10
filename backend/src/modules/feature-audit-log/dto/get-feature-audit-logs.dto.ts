import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetFeatureAuditLogsDto {
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

  /** 도메인: TRADE | SALES | FINANCE */
  @IsOptional()
  @IsString()
  domain?: string;

  /** 기능 코드 */
  @IsOptional()
  @IsString()
  feature?: string;

  /** 작업 유형: CREATED | UPDATED | DELETED */
  @IsOptional()
  @IsString()
  action?: string;

  /** 작업자 user id */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId?: number;

  /** 조회 시작일 (ISO 문자열 또는 YYYY-MM-DD) */
  @IsOptional()
  @IsString()
  from?: string;

  /** 조회 종료일 (ISO 문자열 또는 YYYY-MM-DD) */
  @IsOptional()
  @IsString()
  to?: string;

  /** 요약 검색 (부분 일치) */
  @IsOptional()
  @IsString()
  summary?: string;

  /** 엔티티 타입 (특정 엔티티 이력 조회) */
  @IsOptional()
  @IsString()
  entityType?: string;

  /** 엔티티 ID (특정 엔티티 이력 조회) */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  entityId?: number;
}
