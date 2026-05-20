import { IsString, IsOptional, IsDateString, IsArray, ValidateNested, IsNumber, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSalesItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  containerId!: string;

  @IsOptional()
  @IsEnum(['CONTAINER', 'CARGO'])
  containerType?: 'CONTAINER' | 'CARGO' | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cargoBales?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cargoWeight?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  stoCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dtCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  workFee?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  onsiteWorkFee?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  advancePaymentRatio?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  margin?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  salesUnitPrice?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  salesUnitPriceStage?: string | null; // LOADING | ARRIVAL | UNLOADING

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string | null;
}

export class UpdateSalesDto {
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ceo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  customerPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddressRoad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddressJibun?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  customerLegalBCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerAddressDefaultType?: string;

  // 하차지 주소
  @IsOptional()
  @IsString()
  @MaxLength(10)
  unloadingPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  unloadingAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  unloadingAddressDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  unloadingRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unloadingCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  unloadingAddressRoad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  unloadingAddressJibun?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  unloadingLegalBCode?: string;

  /**
   * 하차지로 선택한 고객 배송지 id. 있으면 저장 시 해당 행만 unloading* 필드로 갱신합니다.
   */
  @IsOptional()
  @IsString()
  unloadingDeliveryAddressId?: string | null;

  @IsOptional()
  @IsDateString()
  reservationDate?: string | null;

  @IsOptional()
  @IsDateString()
  salesDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  requestVehicle?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  transportFee?: number | null;

  // 선입금 정보 (판매 전체 기준)
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  advancePaymentRatio?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  advancePaymentAmount?: number | null;

  // 예약 취소 시 선입금 처리 방법
  @IsOptional()
  @IsEnum(['REFUND', 'KEEP_FOR_NEXT'])
  prepaymentCancellationMethod?: 'REFUND' | 'KEEP_FOR_NEXT' | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string | null;

  /** 판매 취소 다이얼로그에서 호출 시 true (items: []여도 전체 취소로 처리) */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isCancellation?: boolean;

  /** 판매 비고 (운송관리에서도 표시) */
  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSalesItemDto)
  items!: UpdateSalesItemDto[];
}










