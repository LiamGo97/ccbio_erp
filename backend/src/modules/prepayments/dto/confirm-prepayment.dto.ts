import { IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmPrepaymentDto {
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  actualAmount!: number;

  @IsOptional()
  @IsDateString()
  confirmedDate?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string | null;

  @IsOptional()
  @IsString()
  paymentReference?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
