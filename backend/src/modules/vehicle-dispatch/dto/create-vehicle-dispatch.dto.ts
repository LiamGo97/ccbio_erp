import { IsString, IsOptional, Length, IsNumber, IsDateString, IsInt, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLoadingItemDto } from './create-loading-item.dto';

export class CreateVehicleDispatchDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  requestVehicle?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  requestWeight?: string;

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
  @Length(1, 10)
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

  @IsOptional()
  @IsDateString()
  unloadingSchedule?: string;

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
  @Length(1, 100)
  companyName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  requestBL?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  requestContainer?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  orderNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  workBL?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  workContainer?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // 고객 정보 (고객 테이블 업데이트용)
  @IsOptional()
  @IsString()
  @Length(0, 10)
  customerPostalCode?: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsString()
  customerAddressDetail?: string;

  @IsOptional()
  @IsString()
  customerRegion?: string;

  @IsOptional()
  @IsString()
  customerCity?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  dispatchCompanyId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unloadingCompanyId?: number;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  directUnloadingContact?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  driverContact?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  driverName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  entryTime?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  transportFee?: number;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  loadingDateTime?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  unloadingDateTime?: string;

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

