import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsSender } from './entities/sms-sender.entity';
import { SmsSenderService } from './sms-sender.service';
import { SmsSenderController } from './sms-sender.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SmsSender])],
  controllers: [SmsSenderController],
  providers: [SmsSenderService],
  exports: [SmsSenderService],
})
export class SmsSenderModule {}
