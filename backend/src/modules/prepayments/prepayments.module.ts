import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrepaymentsController } from './prepayments.controller';
import { PrepaymentsService } from './prepayments.service';
import { CustomerPrepayment } from '../sales/entities/customer-prepayment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerPrepayment])],
  controllers: [PrepaymentsController],
  providers: [PrepaymentsService],
  exports: [PrepaymentsService],
})
export class PrepaymentsModule {}
