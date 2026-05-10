import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sales } from './entities/sales.entity';
import { SalesItem } from './entities/sales-item.entity';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { CustomerPrepayment } from './entities/customer-prepayment.entity';
import { Customer } from '../customers/entities/customer.entity';
import { TradeContainer } from '../trade-contracts/entities/trade-container.entity';
import { TradeOrder } from '../trade-contracts/entities/trade-order.entity';
import { SalesDelivery } from '../sales-delivery/entities/sales-delivery.entity';
import { SmsHistory } from '../sms-history/entities/sms-history.entity';
import { AccountsReceivable } from '../receivables/entities/accounts-receivable.entity';
import { ReceivableCollection } from '../receivables/entities/receivable-collection.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { SalesService } from './sales.service';
import { InvoiceService } from './invoice.service';
import { SalesController } from './sales.controller';
import { KakaoLocalAddressService } from '../customers/kakao-local-address.service';
import { SalesUnloadingAddressBackfillService } from './sales-unloading-address-backfill.service';
import { RegionsModule } from '../regions/regions.module';
import { CitiesModule } from '../cities/cities.module';
import { CodesModule } from '../codes/codes.module';
import { SalesDeliveryModule } from '../sales-delivery/sales-delivery.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { FeatureAuditLogModule } from '../feature-audit-log/feature-audit-log.module';
import { TradeContractsModule } from '../trade-contracts/trade-contracts.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sales,
      SalesItem,
      Invoice,
      InvoiceItem,
      Customer,
      TradeContainer,
      TradeOrder,
      SalesDelivery,
      SmsHistory,
      AccountsReceivable,
      ReceivableCollection,
      CustomerPrepayment,
      Supplier,
    ]),
    RegionsModule,
    CitiesModule,
    CodesModule,
    SalesDeliveryModule,
    ReceivablesModule,
    FeatureAuditLogModule,
    TradeContractsModule,
    CustomersModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, InvoiceService, KakaoLocalAddressService, SalesUnloadingAddressBackfillService],
  exports: [SalesService, InvoiceService],
})
export class SalesModule {}

