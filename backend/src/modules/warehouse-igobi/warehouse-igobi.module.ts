import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseIgobi } from './entities/warehouse-igobi.entity';
import { WarehouseIgobiService } from './warehouse-igobi.service';
import { WarehouseIgobiController } from './warehouse-igobi.controller';
import { WarehouseModule } from '../warehouse/warehouse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WarehouseIgobi]),
    forwardRef(() => WarehouseModule),
  ],
  controllers: [WarehouseIgobiController],
  providers: [WarehouseIgobiService],
  exports: [WarehouseIgobiService],
})
export class WarehouseIgobiModule {}

