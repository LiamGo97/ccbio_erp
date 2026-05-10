import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';

export class CreateSalesReservationDto {
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bl?: string | null;

  @IsOptional()
  @IsString()
  tradeOrderId?: string | null;

  @IsOptional()
  @IsString()
  containerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  requestedQty?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  qtyUnit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vehicleType?: string | null;

  @IsOptional()
  @Type(() => Number)
  loadingWarehouseId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  loadingWarehouseText?: string | null;

  @IsOptional()
  @IsString()
  customsDate?: string | null;

  @IsOptional()
  @IsString()
  loadingDate?: string | null;

  @IsOptional()
  @IsString()
  loadingScheduleNote?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsString()
  unitPrice?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitPriceStage?: string | null;

  @IsOptional()
  @IsString()
  reference?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
