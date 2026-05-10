import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MallDailyStat } from './entities/mall-daily-stat.entity';
import { MallDailyStatService } from './mall-daily-stat.service';
import { MallDailyStatController } from './mall-daily-stat.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MallDailyStat])],
  controllers: [MallDailyStatController],
  providers: [MallDailyStatService],
  exports: [MallDailyStatService],
})
export class MallDailyStatModule {}
