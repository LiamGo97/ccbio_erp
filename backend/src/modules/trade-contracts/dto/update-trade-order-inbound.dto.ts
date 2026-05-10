import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ContainerPendingPurchaseCostDto {
  @IsString()
  containerId!: string;

  @IsOptional()
  @Type(() => Number)
  pendingPurchaseCost?: number | null;
}

export class ContainerConfirmedPurchaseCostDto {
  @IsString()
  containerId!: string;

  @IsOptional()
  @Type(() => Number)
  confirmedPurchaseCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  stoCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  dtCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  workFee?: number | null;

  @IsOptional()
  @Type(() => Number)
  onsiteWorkFee?: number | null;
}

export class UpdateTradeOrderInboundDto {
  @IsOptional()
  @Type(() => Number)
  doCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  customsFee?: number | null;

  @IsOptional()
  @Type(() => Number)
  quarantineAgencyFee?: number | null;

  @IsOptional()
  @Type(() => Number)
  customsDuty?: number | null;

  @IsOptional()
  @Type(() => Number)
  additionalItem?: number | null;

  @IsOptional()
  @Type(() => Number)
  spot?: number | null;

  @IsOptional()
  @Type(() => Number)
  fumigationQuarantine?: number | null;

  @IsOptional()
  @Type(() => Number)
  document?: number | null;

  @IsOptional()
  @Type(() => Number)
  igobi?: number | null;

  @IsOptional()
  @Type(() => Number)
  extractionFee?: number | null;

  @IsOptional()
  @Type(() => Number)
  sto?: number | null;

  @IsOptional()
  @Type(() => Number)
  firstTierLoadingFee?: number | null;

  @IsOptional()
  @Type(() => Number)
  fee?: number | null;

  @IsOptional()
  @Type(() => Number)
  sampleCollection?: number | null;

  @IsOptional()
  @Type(() => Number)
  bankFee?: number | null;

  @IsOptional()
  @Type(() => Number)
  quarantineWorkCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  quotaCost?: number | null;

  @IsOptional()
  @IsString()
  warehouse?: string | null;

  @IsOptional()
  @IsString()
  igodate?: string | null;

  @IsOptional()
  @IsString()
  quarantineDate?: string | null;

  @IsOptional()
  @IsString()
  dtDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  dayExchangeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  comparisonExchangeRate?: number | null;

  /** 예정 원가 (kg당, 원화) - 입고 예정 데이터 섹션 표시용 */
  @IsOptional()
  @Type(() => Number)
  comparisonPurchaseCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  appliedExchangeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  purchaseCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  targetMargin?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContainerPendingPurchaseCostDto)
  containerPendingPurchaseCosts?: ContainerPendingPurchaseCostDto[] | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContainerConfirmedPurchaseCostDto)
  containerConfirmedPurchaseCosts?: ContainerConfirmedPurchaseCostDto[] | null;

  @IsOptional()
  @IsString()
  status?: 'PENDING' | 'CONFIRMED' | null;

  /** 영업 비고 (BL 단위, 입고 확정 등) */
  @IsOptional()
  @IsString()
  salesNotes?: string | null;
}

