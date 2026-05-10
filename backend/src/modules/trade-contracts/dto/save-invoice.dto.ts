import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SaveInvoicePaymentDto {
  @IsNumber()
  @Type(() => Number)
  sequence!: number;

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  ratio?: number | null;

  @IsOptional()
  @Type(() => Number)
  amount?: number | null;

  @IsOptional()
  @IsString()
  method?: string | null;

  @IsOptional()
  @Type(() => Number)
  exchangeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  krwAmount?: number | null;

  @IsOptional()
  @IsString()
  result?: string | null;
}

export class SaveInvoiceDto {
  @IsOptional()
  @IsString()
  tempFilePath?: string | null;

  @IsOptional()
  @IsString()
  googleDriveFileId?: string | null;

  @IsOptional()
  @IsString()
  originalFileName?: string | null;

  @IsOptional()
  @IsString()
  invoiceNumber?: string | null;

  @IsOptional()
  @IsString()
  invoiceDate?: string | null;

  @IsOptional()
  @IsString()
  invoiceCurrency?: string | null;

  @IsOptional()
  @IsString()
  invoiceCurrencyName?: string | null;

  @IsOptional()
  @Type(() => Number)
  invoiceAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  totalAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  quantity?: number | null;

  @IsOptional()
  @Type(() => Number)
  invoiceWeight?: number | null;

  @IsOptional()
  @Type(() => Number)
  unitPrice?: number | null;

  @IsOptional()
  @IsString()
  currencyName?: string | null;

  @IsOptional()
  @IsString()
  destination?: string | null;

  @IsOptional()
  @IsString()
  etd?: string | null;

  @IsOptional()
  @IsString()
  eta?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveInvoicePaymentDto)
  payments?: SaveInvoicePaymentDto[] | null;
}
