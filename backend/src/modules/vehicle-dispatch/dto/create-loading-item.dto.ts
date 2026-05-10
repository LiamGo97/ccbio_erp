import { IsString, IsOptional, IsInt, Length, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLoadingItemDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  loadingWarehouseId?: number;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  requestBL?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  requestContainer?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  workBL?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  workContainer?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  workWeight?: string;

  @IsOptional()
  @IsEnum(['PENDING', 'LOADING', 'LOADED', 'FAILED', 'CANCELLED'])
  status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  order?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

