import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboundDefaultSetting } from './entities/inbound-default-setting.entity';
import { InboundDefaultsService } from './inbound-defaults.service';
import { InboundDefaultsController } from './inbound-defaults.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InboundDefaultSetting])],
  controllers: [InboundDefaultsController],
  providers: [InboundDefaultsService],
  exports: [InboundDefaultsService],
})
export class InboundDefaultsModule {}
