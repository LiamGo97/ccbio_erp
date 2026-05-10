import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTradeContractDto {
  @IsOptional()
  @IsString()
  contractNo?: string | null;

  @IsOptional()
  @IsString()
  exporter?: string | null;

  @IsOptional()
  @IsString()
  exportCountry?: string | null;

  @IsOptional()
  @IsString()
  productName?: string | null;

  @IsOptional()
  @IsString()
  quota?: string | null;

  @IsOptional()
  @IsString()
  fumigation?: string | null;

  @IsOptional()
  @IsString()
  customsDuty?: string | null;

  @IsOptional()
  @IsString()
  status?: string | null;

  @IsOptional()
  @IsString()
  contractGoogleDriveFileId?: string | null;

  @IsOptional()
  @IsString()
  contractFileName?: string | null;

  // 발주 기본 정보
  @IsOptional()
  @IsString()
  orderDate?: string | null;

  // 상품 정보
  @IsOptional()
  @IsString()
  grade?: string | null;

  @IsOptional()
  @IsString()
  packingType?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  quantity?: number | null;

  // 가격 정보
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  unitPrice?: number | null;

  @IsOptional()
  @IsString()
  currency?: string | null;

  @IsOptional()
  @IsString()
  commissionDollar?: string | null;

  @IsOptional()
  @IsString()
  commissionMonth?: string | null;

  // 기타 정보
  @IsOptional()
  @IsString()
  destination?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  newOld?: string | null;
}

