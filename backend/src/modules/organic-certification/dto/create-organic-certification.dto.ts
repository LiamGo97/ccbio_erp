import { IsString, IsOptional, IsInt, IsDateString, IsNumber, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrganicCertificationDto {
  @IsString()
  @IsOptional()
  certificationAgency?: string;

  @IsString()
  @IsOptional()
  certificationNumber?: string;

  @IsString()
  @IsOptional()
  mainProduct?: string;

  @IsString()
  @IsOptional()
  certificationType?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  producer?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  farmCount?: number;

  @IsString()
  @IsOptional()
  address?: string;

  @IsDateString()
  @IsOptional()
  certificationStartDate?: string;

  @IsDateString()
  @IsOptional()
  certificationEndDate?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  cultivationAreaM2?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  annualProductionTarget?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  livestockCount?: number;

  @IsString()
  @IsOptional()
  deliveryDestination?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  detailProducts?: string[];
}

