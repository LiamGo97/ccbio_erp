import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreeTime } from './entities/free-time.entity';
import { FreeTimeService } from './free-time.service';
import { FreeTimeController } from './free-time.controller';
import { Code } from '../codes/entities/code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FreeTime, Code])],
  controllers: [FreeTimeController],
  providers: [FreeTimeService],
  exports: [FreeTimeService],
})
export class FreeTimeModule {}



