import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleDispatch } from './entities/vehicle-dispatch.entity';
import { VehicleDispatchLoadingItem } from './entities/vehicle-dispatch-loading-item.entity';
import { VehicleDispatchService } from './vehicle-dispatch.service';
import { VehicleDispatchController } from './vehicle-dispatch.controller';
import { RegionsModule } from '../regions/regions.module';
import { CitiesModule } from '../cities/cities.module';
import { Customer } from '../customers/entities/customer.entity';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { User } from '../users/entities/user.entity';
import { FeatureAuditLogModule } from '../feature-audit-log/feature-audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VehicleDispatch, VehicleDispatchLoadingItem, Customer, User]),
    RegionsModule,
    CitiesModule,
    WarehouseModule,
    FeatureAuditLogModule,
  ],
  controllers: [VehicleDispatchController],
  providers: [VehicleDispatchService],
  exports: [VehicleDispatchService],
})
export class VehicleDispatchModule {}


