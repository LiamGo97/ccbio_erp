import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { TradeContractsController } from './trade-contracts.controller';
import { TradeContractsService } from './trade-contracts.service';
import { TradeContract } from './entities/trade-contract.entity';
import { TradeOrder } from './entities/trade-order.entity';
import { TradeOrderPayment } from './entities/trade-order-payment.entity';
import { TradeOrderBookingTempPayment } from './entities/trade-order-booking-temp-payment.entity';
import { FileEntity } from '../files/entities/file.entity';
import { Code } from '../codes/entities/code.entity';
import { TradeContainer } from './entities/trade-container.entity';
import { TradeOrderInbound } from './entities/trade-order-inbound.entity';
import { EtaUpdateBatch } from './entities/eta-update-batch.entity';
import { FreeTime } from '../free-time/entities/free-time.entity';
import { FreeTimeModule } from '../free-time/free-time.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { User } from '../users/entities/user.entity';
import { SalesItem } from '../sales/entities/sales-item.entity';
import { Sales } from '../sales/entities/sales.entity';
import { SalesReservation } from '../sales-reservation/entities/sales-reservation.entity';
import { SalesReservationSheetRow } from '../sales-reservation-sheet/entities/sales-reservation-sheet-row.entity';
import { FeatureAuditLogModule } from '../feature-audit-log/feature-audit-log.module';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads/contracts',
    }),
    TypeOrmModule.forFeature([
      TradeContract,
      TradeOrder,
      TradeOrderPayment,
      TradeOrderBookingTempPayment,
      TradeContainer,
      TradeOrderInbound,
      EtaUpdateBatch,
      FileEntity,
      Code,
      FreeTime,
      User,
      SalesItem,
      Sales,
      SalesReservation,
      SalesReservationSheetRow,
    ]),
    FreeTimeModule,
    GoogleDriveModule,
    FeatureAuditLogModule,
  ],
  controllers: [TradeContractsController],
  providers: [TradeContractsService],
  exports: [TradeContractsService],
})
export class TradeContractsModule {}

