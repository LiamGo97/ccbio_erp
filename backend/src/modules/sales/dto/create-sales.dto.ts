import { IsString, IsOptional, IsArray, ValidateNested, IsDateString, MaxLength, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSalesItemDto {
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

export class CreateSalesDto {
  // 고객 정보 (customerId가 있으면 업데이트, 없으면 전화번호로 찾거나 생성)
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

  /** 도로명 주소 (신규, cu_address_road) — 레거시 cu_address와 병행 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddressRoad?: string;

  /** 지번 주소 (신규, cu_address_jibun) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddressJibun?: string;

  /** 법정동코드 10자리 (화면 비표시·연동용, cu_legal_b_code) */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  customerLegalBCode?: string;

  /** ROAD | JIBUN 등 (cu_address_default_type) */
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
   * 하차지로 선택한 고객 배송지(tb_customer_delivery_address) id.
   * 있으면 저장 시 해당 행을 DTO의 하차지(unloading*) 필드로 갱신합니다.
   */
  @IsOptional()
  @IsString()
  unloadingDeliveryAddressId?: string | null;

  // 판매 정보
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

  /** 등록 유형: RESERVED=예약 등록(전체 예약), SALE=판매 등록(입고상태 기준). 없으면 기존처럼 입고상태로 자동 결정 */
  @IsOptional()
  @IsEnum(['RESERVED', 'SALE'])
  registerAs?: 'RESERVED' | 'SALE';

  // 판매 항목
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesItemDto)
  items!: CreateSalesItemDto[];
}

