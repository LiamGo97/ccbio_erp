import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, Length, IsNumber, IsInt, ValidateIf, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CreateSalesDeliveryDto } from './create-sales-delivery.dto';

export class UpdateSalesDeliveryDto extends PartialType(CreateSalesDeliveryDto) {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  status?: 'PENDING_DISPATCH' | 'DISPATCH_REQUESTED' | 'DISPATCHING' | 'DISPATCH_COMPLETED' | 'LOADING' | 'LOADING_COMPLETED' | 'UNLOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED';

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @Transform(({ value }) => (value === null || value === undefined ? value : Number(value)))
  weighingFee?: number | null;

  @IsOptional()
  @IsString()
  statusReason?: string;

  @IsOptional()
  @IsString()
  reprocessReason?: string;

  @IsOptional()
  @ValidateIf((o) => o.dispatchCompanyId !== null && o.dispatchCompanyId !== undefined)
  @IsInt()
  @Transform(({ value }) => value === null || value === undefined ? value : Number(value))
  dispatchCompanyId?: number | null;

  @IsOptional()
  @ValidateIf((o) => o.unloadingCompanyId !== null && o.unloadingCompanyId !== undefined)
  @IsInt()
  @Transform(({ value }) => value === null || value === undefined ? value : Number(value))
  unloadingCompanyId?: number | null;

  /** 직접 하차 선택 시 연락처 (unloadingCompanyId가 null일 때) */
  @IsOptional()
  @IsString()
  @Length(0, 50)
  directUnloadingContact?: string | null;

  /** true면 상차 작업 내용을 tb_sales_delivery_work_line에 동기화. 상차 업체 수정 시에만 true로 보내고, 하차완료 행 삭제 시에는 보내지 않음. */
  @IsOptional()
  syncWorkLine?: boolean;

  /** 하차완료 확인 시 "행 삭제"한 상차 항목 ID. 해당 행은 삭제하지 않고 실제 확정(actual*)만 null로 두어 요청·작업 정보는 유지, 재고 반영만 제외 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removedLoadingItemIds?: string[];

  /** 운송비 지급 상태 (UNPAID/PAID) */
  @IsOptional()
  @IsString()
  @Length(1, 20)
  transportFeePaymentStatus?: string;

  /** 하차완료 시 계근증 관련 텍스트 (상대편이 보낸 내용 등) */
  @IsOptional()
  @IsString()
  weighingCertInfo?: string | null;

  /** 하차완료 시 계근증 이미지 경로 (GCS 버킷 내부 경로 JSON 배열) */
  @IsOptional()
  @IsString()
  weighingCertImagePaths?: string | null;
}

