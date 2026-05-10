import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateCompanyInfoDto {
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
}

