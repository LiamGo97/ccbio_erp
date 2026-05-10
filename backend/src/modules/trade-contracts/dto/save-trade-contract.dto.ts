import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TradeOrderPaymentDraftDto {
  @IsNumber()
  @Type(() => Number)
  sequence!: number;

  @IsOptional()
  @IsString()
  due_date?: string | null;

  @IsOptional()
  @Type(() => Number)
  ratio?: number | null;

  @IsOptional()
  @Type(() => Number)
  amount?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  method?: string | null;

  @IsOptional()
  @Type(() => Number)
  exchangeRate?: number | null;

  @IsOptional()
  @IsString()
  result?: string | null;
}

export class TradeOrderDraftDto {
  @IsString()
  @IsNotEmpty()
  to_contract_no!: string;

  @IsNumber()
  @Type(() => Number)
  to_shipment_seq!: number;

  @IsOptional()
  @IsString()
  to_export_country?: string;

  @IsOptional()
  @IsString()
  to_product_name?: string;

  @IsOptional()
  @Type(() => Number)
  to_quantity?: number;

  @IsOptional()
  @IsString()
  to_grade?: string;

  @IsOptional()
  @IsString()
  to_bk?: string;

  @IsOptional()
  @IsString()
  to_bl?: string;

  @IsOptional()
  @IsString()
  to_packing_type?: string;

  @IsOptional()
  @IsString()
  to_currency?: string;

  @IsOptional()
  @Type(() => Number)
  to_unit_price?: number;

  @IsOptional()
  @IsString()
  to_destination?: string;

  @IsOptional()
  @IsString()
  to_etd?: string;

  @IsOptional()
  @IsString()
  to_exporter?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeOrderPaymentDraftDto)
  payments?: TradeOrderPaymentDraftDto[];
}

export class SaveTradeContractDto {
  @IsOptional()
  @IsString()
  tempFilePath?: string;

  @IsOptional()
  @IsString()
  googleDriveFileId?: string;

  @IsString()
  @IsNotEmpty()
  originalFileName!: string;

  @IsOptional()
  @IsString()
  fileMimeType?: string;

  @IsOptional()
  @Type(() => Number)
  fileSize?: number;

  @IsOptional()
  @IsString()
  contractNumber?: string;

  @IsOptional()
  @IsString()
  rawResult?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  status?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeOrderDraftDto)
  draftOrders!: TradeOrderDraftDto[];
}


