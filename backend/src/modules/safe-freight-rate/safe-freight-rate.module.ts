import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SafeFreightRate } from './entities/safe-freight-rate.entity';
import { SafeFreightRateService } from './safe-freight-rate.service';
import { SafeFreightRateController } from './safe-freight-rate.controller';
import { Code } from '../codes/entities/code.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SafeFreightRate, Code]),
  ],
  controllers: [SafeFreightRateController],
  providers: [SafeFreightRateService],
  exports: [SafeFreightRateService],
})
export class SafeFreightRateModule {}

