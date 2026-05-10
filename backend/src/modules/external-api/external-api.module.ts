import { Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { ExternalCustomersController } from './external-customers.controller';
import { ExternalSafeFreightRatesController } from './external-safe-freight-rates.controller';
import { TradeContractsModule } from '../trade-contracts/trade-contracts.module';
import { CustomersModule } from '../customers/customers.module';
import { SafeFreightRateModule } from '../safe-freight-rate/safe-freight-rate.module';
import { LegalAdminMasterModule } from '../legal-admin-master/legal-admin-master.module';

@Module({
  imports: [
    TradeContractsModule,
    CustomersModule,
    SafeFreightRateModule,
    LegalAdminMasterModule,
  ],
  controllers: [
    ExternalApiController,
    ExternalCustomersController,
    ExternalSafeFreightRatesController,
  ],
})
export class ExternalApiModule {}
