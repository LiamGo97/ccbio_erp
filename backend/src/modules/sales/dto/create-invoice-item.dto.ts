import { IsString, IsOptional, IsNumber, IsInt, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInvoiceItemDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  order?: number;

  @IsOptional()
  @IsString()
  salesItemId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  quantity?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  unitPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amount?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vatAmount?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  weight?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}


