import { Module } from '@nestjs/common';
import { InternalCronController } from './internal-cron.controller';
import { TradeContractsModule } from '../trade-contracts/trade-contracts.module';

@Module({
  imports: [TradeContractsModule],
  controllers: [InternalCronController],
})
export class InternalCronModule {}
