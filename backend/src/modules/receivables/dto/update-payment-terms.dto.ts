import { IsEnum, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export type PaymentTermsType = 
  | 'DAYS' 
  | 'THIS_MONTH_DAY' 
  | 'NEXT_MONTH_DAY' 
  | 'THIS_MONTH_END' 
  | 'NEXT_MONTH_END';

export class UpdatePaymentTermsDto {
  @IsEnum(['DAYS', 'THIS_MONTH_DAY', 'NEXT_MONTH_DAY', 'THIS_MONTH_END', 'NEXT_MONTH_END'])
  paymentTermsType!: PaymentTermsType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  paymentTermsValue?: number | null;
}
