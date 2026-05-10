import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

/** 부킹 단계 임시 결제(최대 2차) — tb_trade_order_booking_temp_payment */
export class BookingTempPaymentDto {
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

  @IsOptional()
  @IsString()
  notes?: string | null;
}
