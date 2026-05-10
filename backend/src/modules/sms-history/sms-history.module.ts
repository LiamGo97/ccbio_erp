import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsHistory } from './entities/sms-history.entity';
import { SmsHistoryService } from './sms-history.service';
import { SmsHistoryController } from './sms-history.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SmsHistory])],
  controllers: [SmsHistoryController],
  providers: [SmsHistoryService],
  exports: [SmsHistoryService],
})
export class SmsHistoryModule {}
