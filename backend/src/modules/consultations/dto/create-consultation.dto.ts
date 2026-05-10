import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerOperationDto } from '../../customers/dto/customer-operation.dto';

export class CreateConsultationDto {
  @IsString()
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ceo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  customerPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  species?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  operation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  herdSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  feeding?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  chamchamStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  inquiryProduct?: string;

  @IsOptional()
  @IsDateString()
  consultationDate?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  inOut?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  productName?: string; // 호환성을 위해 유지 (첫 번째 제품 정보)

  @IsOptional()
  @IsString()
  @MaxLength(100)
  grade?: string; // 호환성을 위해 유지 (첫 번째 제품 정보)

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsultationProductDto)
  products?: ConsultationProductDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestedWeight?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  deliveryPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deliveryAddressDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  proposedPrice?: string;

  @IsOptional()
  @IsBoolean()
  hasUnloading?: boolean;

  @IsOptional()
  @IsBoolean()
  hasHandling?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  managerId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerOperationDto)
  operations?: CustomerOperationDto[]; // 운영방식 배열

  @IsOptional()
  @IsString()
  @MaxLength(150)
  mainProduct?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  arrivalPrice?: string;
}

export class ConsultationProductDto {
  @IsOptional()
  @IsInt()
  productCategoryId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  productName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  grade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  packingType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestedWeight?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestedVehicle?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;
}

