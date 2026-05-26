import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersService } from './customers.service';
import { KakaoLocalAddressService } from './kakao-local-address.service';
import { CustomersController } from './customers.controller';
import { Customer } from './entities/customer.entity';
import { CustomerOperation } from './entities/customer-operation.entity';
import { CustomerStatementName } from './entities/customer-statement-name.entity';
import { CustomerDeliveryAddress } from './entities/customer-delivery-address.entity';
import { CustomerContact } from './entities/customer-contact.entity';
import { CodesModule } from '../codes/codes.module';
import { RegionsModule } from '../regions/regions.module';
import { CitiesModule } from '../cities/cities.module';
import { LegalAdminMaster } from '../legal-admin-master/entities/legal-admin-master.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerOperation,
      CustomerStatementName,
      CustomerDeliveryAddress,
      CustomerContact,
      LegalAdminMaster,
      User,
    ]),
    CodesModule,
    RegionsModule,
    CitiesModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, KakaoLocalAddressService],
  exports: [CustomersService],
})
export class CustomersModule {}


