import { Module } from '@nestjs/common';
import { EcountService } from './ecount.service';
import { EcountController } from './ecount.controller';

@Module({
  controllers: [EcountController],
  providers: [EcountService],
  exports: [EcountService],
})
export class EcountModule {}


