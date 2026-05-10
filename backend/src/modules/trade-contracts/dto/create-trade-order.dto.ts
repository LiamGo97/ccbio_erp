import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { BookingTempPaymentDto } from './booking-temp.dto';

export class TradeOrderPaymentCreateDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sequence?: number | null;

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
  notes?: string | null;

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

  @IsOptional()
  @IsString()
  paymentType?: string | null; // PAYMENT_TYPE 코드 값 (REGULAR, DO_COST, CUSTOMS_COST)

  @IsOptional()
  @Type(() => Boolean)
  useRatio?: boolean | null; // 비율 사용 여부 (기본값: true)
}

export class TradeContainerCreateDto {
  @IsOptional()
  @IsString()
  containerNo?: string | null;

  @IsOptional()
  @IsString()
  product?: string | null;

  @IsOptional()
  @IsString()
  tradeGrade?: string | null;

  @IsOptional()
  @IsString()
  salesGrade?: string | null;

  @IsOptional()
  @IsString()
  packingType?: string | null;

  @IsOptional()
  @IsString()
  currency?: string | null;

  @IsOptional()
  @Type(() => Number)
  unitPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  weight?: number | null;

  /** 무역 베일수(문서/계약 기준) */
  @IsOptional()
  @Type(() => Number)
  tradeBales?: number | null;

  /** 영업 베일수. null이면 무역 베일과 동일로 간주 */
  @IsOptional()
  @Type(() => Number)
  salesBales?: number | null;
}

export class CreateTradeOrderDto {
  @IsOptional()
  @IsString()
  contractId?: string | null;

  @IsOptional()
  @IsString()
  contractNo?: string | null;

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
  spot?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  shipmentSeq?: number | null;

  /** 서브순번. 0 또는 미전달이면 없음("7"), 1 이상이면 "7-1", "7-2" */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  shipmentSeqSub?: number | null;

  @IsOptional()
  @IsString()
  exportCountry?: string | null;

  @IsOptional()
  @IsString()
  exporter?: string | null;

  @IsOptional()
  @IsString()
  productName?: string | null;

  @IsOptional()
  @IsString()
  newOld?: string | null;

  @IsOptional()
  @IsString()
  commissionMonth?: string | null;

  @IsOptional()
  @IsString()
  commissionDollar?: string | null;

  @IsOptional()
  @IsString()
  orderDate?: string | null;

  @IsOptional()
  @IsString()
  shippingLine?: string | null;

  @IsOptional()
  @Type(() => Number)
  quantity?: number | null;

  @IsOptional()
  @IsString()
  grade?: string | null;

  @IsOptional()
  @IsString()
  bk?: string | null;

  @IsOptional()
  @IsString()
  bl?: string | null;

  @IsOptional()
  @IsString()
  packingType?: string | null;

  @IsOptional()
  @IsString()
  currency?: string | null;

  @IsOptional()
  @Type(() => Number)
  unitPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  totalAmount?: number | null;

  @IsOptional()
  @IsString()
  destination?: string | null;

  @IsOptional()
  @IsString()
  finalDestination?: string | null;

  @IsOptional()
  @IsString()
  finalDestinationArrivalDate?: string | null;

  @IsOptional()
  @IsString()
  etd?: string | null;

  @IsOptional()
  @IsString()
  etdApi?: string | null;

  @IsOptional()
  @IsString()
  eta?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  dm?: string | null;

  @IsOptional()
  @IsString()
  dt?: string | null;

  @IsOptional()
  @IsString()
  cb?: string | null;

  @IsOptional()
  @IsString()
  quarantineDate?: string | null;

  @IsOptional()
  @IsString()
  customsDate?: string | null;

  @IsOptional()
  @IsString()
  customsScheduledDate?: string | null;

  @IsOptional()
  @IsString()
  certificateRequest?: string | null;

  @IsOptional()
  @IsString()
  claim?: string | null;

  @IsOptional()
  @IsString()
  bankPickup?: string | null;

  @IsOptional()
  @IsString()
  sto?: string | null;

  @IsOptional()
  @IsString()
  hasOriginalShipment?: string | null;

  @IsOptional()
  @IsString()
  originalShipment?: string | null;

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
  @Type(() => Number)
  invoiceAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  invoiceWeight?: number | null;

  @IsOptional()
  @IsString()
  invoiceFilePath?: string | null;

  @IsOptional()
  @IsString()
  invoiceFileName?: string | null;

  @IsOptional()
  @IsString()
  invoiceGoogleDriveFileId?: string | null;

  @IsOptional()
  @IsString()
  productImagesFolderId?: string | null;

  @IsOptional()
  @IsString()
  productImagesFolderName?: string | null;

  @IsOptional()
  @IsString()
  contractGoogleDriveFileId?: string | null;

  @IsOptional()
  @IsString()
  contractFileName?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalOrderCount?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeOrderPaymentCreateDto)
  payments?: TradeOrderPaymentCreateDto[] | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeContainerCreateDto)
  containers?: TradeContainerCreateDto[] | null;

  @IsOptional()
  @IsString()
  status?: 'BOOKING' | 'DOCUMENTS' | 'DO' | 'ARRIVED' | 'QUARANTINE' | 'CUSTOMS' | 'COMPLETED' | null;

  @IsOptional()
  @IsString()
  tradeStatus?: 'BOOKING' | 'DOCUMENTS' | 'DO' | 'ARRIVED' | 'QUARANTINE' | 'CUSTOMS' | 'COMPLETED' | null;

  @IsOptional()
  @IsString()
  salesStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;

  @IsOptional()
  @IsString()
  financeStatus?: 'PAYMENT_PENDING' | 'PAYMENT_PROCESSING' | 'PAYMENT_COMPLETED' | null;

  @IsOptional()
  @Type(() => Number)
  bookingTempWeightMt?: number | null;

  @IsOptional()
  @Type(() => Number)
  bookingTempInvoiceAmount?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => BookingTempPaymentDto)
  bookingTempPayments?: BookingTempPaymentDto[] | null;
}

