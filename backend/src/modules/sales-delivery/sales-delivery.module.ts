import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesDelivery } from './entities/sales-delivery.entity';
import { SalesDeliveryLoadingItem } from './entities/sales-delivery-loading-item.entity';
import { SalesDeliveryWorkLine } from './entities/sales-delivery-work-line.entity';
import { Sales } from '../sales/entities/sales.entity';
import { SalesItem } from '../sales/entities/sales-item.entity';
import { TradeContainer } from '../trade-contracts/entities/trade-container.entity';
import { User } from '../users/entities/user.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { Region } from '../regions/entities/region.entity';
import { City } from '../cities/entities/city.entity';
import { Customer } from '../customers/entities/customer.entity';
import { SalesDeliveryService } from './sales-delivery.service';
import { SalesDeliveryController } from './sales-delivery.controller';
import { FeatureAuditLogModule } from '../feature-audit-log/feature-audit-log.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesDelivery,
      SalesDeliveryLoadingItem,
      SalesDeliveryWorkLine,
      Sales,
      SalesItem,
      TradeContainer,
      User,
      Warehouse,
      Region,
      City,
      Customer,
    ]),
    FeatureAuditLogModule,
    CustomersModule,
  ],
  providers: [SalesDeliveryService],
  controllers: [SalesDeliveryController],
  exports: [SalesDeliveryService],
})
export class SalesDeliveryModule {}

