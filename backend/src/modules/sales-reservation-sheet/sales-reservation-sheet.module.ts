import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { Code } from '../codes/entities/code.entity';
import { Customer } from '../customers/entities/customer.entity';
import { TradeOrder } from '../trade-contracts/entities/trade-order.entity';
import { SalesReservationSheetRow } from './entities/sales-reservation-sheet-row.entity';
import { SalesReservationSheetRowLog } from './entities/sales-reservation-sheet-row-log.entity';
import { SalesReservationSheetController } from './sales-reservation-sheet.controller';
import { SalesReservationSheetService } from './sales-reservation-sheet.service';
import { SalesReservationSheetSseService } from './sales-reservation-sheet-sse.service';
import { SalesReservationSheetStreamController } from './sales-reservation-sheet-stream.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesReservationSheetRow,
      SalesReservationSheetRowLog,
      Code,
      Customer,
      TradeOrder,
    ]),
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [SalesReservationSheetController, SalesReservationSheetStreamController],
  providers: [SalesReservationSheetService, SalesReservationSheetSseService],
  exports: [SalesReservationSheetService],
})
export class SalesReservationSheetModule {}
