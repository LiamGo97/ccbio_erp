import { Module } from '@nestjs/common';
import { AligoService } from './aligo.service';
import { AligoController } from './aligo.controller';
import { StorageModule } from '../storage/storage.module';
import { SmsHistoryModule } from '../sms-history/sms-history.module';

@Module({
  imports: [StorageModule, SmsHistoryModule],
  controllers: [AligoController],
  providers: [AligoService],
  exports: [AligoService],
})
export class AligoModule {}

