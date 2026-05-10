import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MaxLength(100)
  name: string;

  // 실제 창고 주소 (카카오 주소 API)
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  addressDetail?: string;

  // 계근대 주소 (카카오 주소 API)
  @IsOptional()
  @IsBoolean()
  useInternalGyegeundae?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  gyegeundaePostalCode?: string;

  @IsOptional()
  @IsString()
  gyegeundaeAddress?: string;

  @IsOptional()
  @IsString()
  gyegeundaeAddressDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  managerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  managerPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}

