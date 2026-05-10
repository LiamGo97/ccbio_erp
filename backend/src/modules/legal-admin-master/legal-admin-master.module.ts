import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegalAdminMaster } from './entities/legal-admin-master.entity';
import { LegalAdminMasterService } from './legal-admin-master.service';
import { LegalAdminMasterController } from './legal-admin-master.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LegalAdminMaster])],
  controllers: [LegalAdminMasterController],
  providers: [LegalAdminMasterService],
  exports: [LegalAdminMasterService],
})
export class LegalAdminMasterModule {}
