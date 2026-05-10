import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleDispatch } from '../vehicle-dispatch/entities/vehicle-dispatch.entity';
import { VehicleDispatchLoadingItem } from '../vehicle-dispatch/entities/vehicle-dispatch-loading-item.entity';
import { Sales } from '../sales/entities/sales.entity';
import { SalesVehicleDispatchService } from './sales-vehicle-dispatch.service';
import { SalesVehicleDispatchController } from './sales-vehicle-dispatch.controller';
import { VehicleDispatchModule } from '../vehicle-dispatch/vehicle-dispatch.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VehicleDispatch, VehicleDispatchLoadingItem, Sales]),
    VehicleDispatchModule, // VehicleDispatchService 사용을 위해 import
  ],
  controllers: [SalesVehicleDispatchController],
  providers: [SalesVehicleDispatchService],
  exports: [SalesVehicleDispatchService],
})
export class SalesVehicleDispatchModule {}








