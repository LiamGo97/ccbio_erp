import { IsDateString, IsInt, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWarehouseIgobiDto {
  @IsInt()
  @Type(() => Number)
  warehouseId!: number;

  @IsDateString()
  baseDate!: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  igobi!: number;
}

