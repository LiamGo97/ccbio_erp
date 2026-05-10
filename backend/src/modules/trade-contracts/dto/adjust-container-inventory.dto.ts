import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsEnum, Min, ValidateIf } from 'class-validator';

export enum InventoryAdjustmentType {
  INBOUND = 'INBOUND', // 재고 입고 (추가)
  CONSUMPTION = 'CONSUMPTION', // 재고 소모 (차감)
}

export class AdjustContainerInventoryDto {
  @IsEnum(InventoryAdjustmentType)
  type!: InventoryAdjustmentType;

  @IsOptional()
  @ValidateIf((o) => o.bales !== null && o.bales !== undefined)
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  bales?: number | null;

  @IsOptional()
  @ValidateIf((o) => o.weight !== null && o.weight !== undefined)
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  weight?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  salesUnitPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  stoCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  dtCost?: number | null;

  @IsOptional()
  notes?: string | null;
}
