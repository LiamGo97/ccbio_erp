import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { User } from '../users/entities/user.entity';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseIgobiModule } from '../warehouse-igobi/warehouse-igobi.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Warehouse, User]),
    forwardRef(() => WarehouseIgobiModule),
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService, TypeOrmModule],
})
export class WarehouseModule {}


