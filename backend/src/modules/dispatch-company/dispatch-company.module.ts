import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchCompany } from './entities/dispatch-company.entity';
import { DispatchCompanyService } from './dispatch-company.service';
import { DispatchCompanyController } from './dispatch-company.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DispatchCompany])],
  controllers: [DispatchCompanyController],
  providers: [DispatchCompanyService],
  exports: [DispatchCompanyService],
})
export class DispatchCompanyModule {}

