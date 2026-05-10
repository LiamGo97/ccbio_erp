import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, Length, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSalesVehicleDispatchDto } from './create-sales-vehicle-dispatch.dto';

export class UpdateSalesVehicleDispatchDto extends PartialType(CreateSalesVehicleDispatchDto) {
  // 판매 ID는 수정 시에도 선택사항 (변경하지 않을 수 있음)
  @IsOptional()
  @IsString()
  salesId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  status?: 'DRAFT' | 'DISPATCH_COMPLETED' | 'ASSIGNED' | 'LOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED' | 'UNLOADING_COMPLETED';

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  weighingFee?: number;

  @IsOptional()
  @IsString()
  statusReason?: string;

  @IsOptional()
  @IsString()
  reprocessReason?: string;
}








