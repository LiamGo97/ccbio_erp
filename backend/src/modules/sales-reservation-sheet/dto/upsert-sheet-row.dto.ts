import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertSheetRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  salesGrade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  bl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contact?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestedQty?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleCode?: string | null;

  @IsOptional()
  @IsString()
  loadingSchedule?: string | null;

  @IsOptional()
  @IsString()
  arrivalSchedule?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  unitPrice?: number | null;

  @IsOptional()
  @IsString()
  reference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string | null;
}
