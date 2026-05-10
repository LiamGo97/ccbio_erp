import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetOrganicCertificationsDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  certificationAgency?: string;

  @IsString()
  @IsOptional()
  certificationType?: string;

  @IsString()
  @IsOptional()
  producer?: string;

  @IsString()
  @IsOptional()
  mainProduct?: string;

  @IsString()
  @IsOptional()
  region?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  sortBy?: string;

  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc';
}

