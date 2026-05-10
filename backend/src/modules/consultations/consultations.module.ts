import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consultation } from './entities/consultation.entity';
import { ConsultationProduct } from './entities/consultation-product.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerOperation } from '../customers/entities/customer-operation.entity';
import { User } from '../users/entities/user.entity';
import { Region } from '../regions/entities/region.entity';
import { City } from '../cities/entities/city.entity';
import { Code } from '../codes/entities/code.entity';
import { ConsultationsService } from './consultations.service';
import { ConsultationsController } from './consultations.controller';
import { CodesModule } from '../codes/codes.module';
import { RegionsModule } from '../regions/regions.module';
import { CitiesModule } from '../cities/cities.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Consultation,
      ConsultationProduct,
      Customer,
      CustomerOperation,
      User,
      Region,
      City,
      Code,
    ]),
    CodesModule,
    RegionsModule,
    CitiesModule,
  ],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}

