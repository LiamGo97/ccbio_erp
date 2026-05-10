import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureAuditLog } from './entities/feature-audit-log.entity';
import { FeatureAuditLogService } from './feature-audit-log.service';
import { FeatureAuditLogController } from './feature-audit-log.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureAuditLog])],
  controllers: [FeatureAuditLogController],
  providers: [FeatureAuditLogService],
  exports: [FeatureAuditLogService],
})
export class FeatureAuditLogModule {}
