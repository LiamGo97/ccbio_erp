import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnloadingCompany } from './entities/unloading-company.entity';
import { UnloadingCompanyService } from './unloading-company.service';
import { UnloadingCompanyController } from './unloading-company.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UnloadingCompany])],
  controllers: [UnloadingCompanyController],
  providers: [UnloadingCompanyService],
  exports: [UnloadingCompanyService],
})
export class UnloadingCompanyModule {}

