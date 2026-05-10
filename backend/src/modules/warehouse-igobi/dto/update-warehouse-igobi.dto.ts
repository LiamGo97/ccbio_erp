import { IsDateString, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateWarehouseIgobiDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  warehouseId?: number;

  @IsOptional()
  @IsDateString()
  baseDate?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  igobi?: number;
}

