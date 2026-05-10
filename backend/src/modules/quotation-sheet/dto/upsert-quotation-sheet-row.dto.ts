import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertQuotationSheetRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  eta?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  currency?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  unitPrice?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  exportCountry?: string | null;

  @IsOptional()
  @IsString()
  product?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  grade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  packing?: string | null;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fxCalc?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cost?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  margin?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sellingPrice?: string | null;
}
