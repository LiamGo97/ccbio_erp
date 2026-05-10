import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, Length, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVehicleDispatchDto } from './create-vehicle-dispatch.dto';

export class UpdateVehicleDispatchDto extends PartialType(CreateVehicleDispatchDto) {
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


