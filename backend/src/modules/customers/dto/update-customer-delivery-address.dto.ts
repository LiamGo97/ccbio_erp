import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomerDeliveryAddressDto } from './create-customer-delivery-address.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCustomerDeliveryAddressDto extends PartialType(CreateCustomerDeliveryAddressDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
