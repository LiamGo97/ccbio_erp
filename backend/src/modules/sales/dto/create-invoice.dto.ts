import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, MaxLength, IsBoolean, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateInvoiceItemDto } from './create-invoice-item.dto';

export class CreateInvoiceDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string | null;

  @IsOptional()
  @IsString()
  issuedAt?: string | null; // 발행일시 (ISO 8601 형식: YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm:ss)

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  netWeight?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items!: CreateInvoiceItemDto[];

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  vatApplied?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vatRate?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  smsManagerId?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  supplierId?: number | null;

  /** 발행 시 선택한 발행용 이름 ID */
  @IsOptional()
  @IsString()
  statementNameId?: string | null;

  /** 발행 시점 수취인 업체명 스냅샷 */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  companyName?: string | null;

  /** 발행 시점 수취인 대표자 스냅샷 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ceo?: string | null;

  /** 발행 시점 수취인 연락처 스냅샷 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  /** MMS·첨부 이미지 공개 URL */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  attachmentImageUrl?: string | null;

  /** MMS·첨부 이미지 GCS 경로 */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  attachmentImagePath?: string | null;
}


