import { IsString, IsOptional, Length, IsNumber, IsDateString, IsInt, IsArray, ValidateNested, ValidateIf, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CreateLoadingItemDto } from './create-loading-item.dto';

export class CreateSalesDeliveryDto {
  @IsString()
  salesId!: string; // Sales ID is mandatory for sales-linked delivery

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @Length(0, 50)
  requestVehicle?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @Length(0, 50)
  requestWeight?: string | null;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  loadingWarehouseId?: number;

  @IsOptional()
  @IsDateString()
  loadingSchedule?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  loadingScheduleTime?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10)
  unloadingPostalCode?: string;

  @IsOptional()
  @IsString()
  unloadingAddress?: string;

  @IsOptional()
  @IsString()
  unloadingAddressDetail?: string;

  @IsOptional()
  @IsString()
  unloadingRegion?: string;

  @IsOptional()
  @IsString()
  unloadingCity?: string;

  /** 판매(tb_sales) 하차지 동기화용 — 배송 수정 시 함께 저장 */
  @IsOptional()
  @IsString()
  @Length(0, 500)
  unloadingAddressRoad?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  unloadingAddressJibun?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10)
  unloadingLegalBCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  unloadingAddressDefaultType?: string;

  /** 하차지를 이 고객 배송지 행에만 반영할 때(대표 주소는 변경하지 않음) */
  @IsOptional()
  @IsString()
  @Length(0, 32)
  unloadingDeliveryAddressId?: string | null;

  /** false면 tb_sales 하차지만 갱신하고 고객 대표 주소 동기화는 하지 않음 */
  @IsOptional()
  @IsBoolean()
  unloadingMirrorToCustomerDefault?: boolean;

  @IsOptional()
  @IsDateString()
  unloadingScheduleDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  unloadingScheduleTime?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  freightPaymentType?: string;

  @IsOptional()
  @IsString()
  notes?: string;

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

  @IsOptional()
  @IsString()
  @Length(0, 50)
  directUnloadingContact?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @Length(0, 50)
  vehicleNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @Length(0, 50)
  driverContact?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @Length(0, 50)
  driverName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @Length(0, 50)
  entryTime?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  loadingDateTime?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  unloadingDateTime?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @Transform(({ value }) => (value === null || value === undefined ? value : Number(value)))
  transportFee?: number | null;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  transportFeePaymentStatus?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLoadingItemDto)
  loadingItems?: CreateLoadingItemDto[];

  @IsOptional()
  @IsString()
  @Length(1, 20)
  status?: string;
}

