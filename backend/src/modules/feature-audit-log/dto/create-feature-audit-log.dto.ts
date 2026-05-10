import { IsString, IsOptional, IsInt, IsObject, MaxLength, IsIn } from 'class-validator';

export class CreateFeatureAuditLogDto {
  @IsString()
  @IsIn(['TRADE', 'SALES', 'FINANCE'])
  domain: string;

  @IsString()
  @MaxLength(50)
  feature: string;

  @IsString()
  @IsIn(['CREATED', 'UPDATED', 'DELETED', 'STATUS_CHANGE'])
  action: string;

  @IsOptional()
  @IsInt()
  userId?: number | null;

  @IsString()
  @MaxLength(500)
  summary: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string | null;

  @IsOptional()
  @IsInt()
  entityId?: number | null;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown> | null;

  /** 엔티티 변경 스냅샷 (tb_entity_change_history 통합용) */
  @IsOptional()
  @IsObject()
  oldData?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  newData?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  changedFields?: Record<string, { old: unknown; new: unknown }> | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}
