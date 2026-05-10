import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganicCertification } from './entities/organic-certification.entity';
import { OrganicCertificationService } from './organic-certification.service';
import { OrganicCertificationController } from './organic-certification.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OrganicCertification])],
  controllers: [OrganicCertificationController],
  providers: [OrganicCertificationService],
  exports: [OrganicCertificationService],
})
export class OrganicCertificationModule {}

