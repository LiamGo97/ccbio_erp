import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesReservation } from './entities/sales-reservation.entity';
import { TradeOrder } from '../trade-contracts/entities/trade-order.entity';
import { SalesReservationService } from './sales-reservation.service';
import { SalesReservationController } from './sales-reservation.controller';
import { TradeContractsModule } from '../trade-contracts/trade-contracts.module';

@Module({
  imports: [TypeOrmModule.forFeature([SalesReservation, TradeOrder]), TradeContractsModule],
  controllers: [SalesReservationController],
  providers: [SalesReservationService],
})
export class SalesReservationModule {}
