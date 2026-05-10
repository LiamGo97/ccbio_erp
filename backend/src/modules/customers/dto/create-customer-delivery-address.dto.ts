import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomerDeliveryAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressRoad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressJibun?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  addressDefaultType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  legalBCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  mallDeliveryAddressId?: string;
}
