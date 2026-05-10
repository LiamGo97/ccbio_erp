import { IsString, IsNotEmpty, MaxLength, IsOptional, IsBoolean } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  businessRegistrationNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  representativeName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  companyName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tel: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
