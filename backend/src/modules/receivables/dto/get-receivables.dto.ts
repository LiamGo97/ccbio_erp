import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetReceivablesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  status?: string; // OUTSTANDING | PARTIAL | COMPLETED

  @IsOptional()
  @IsString()
  warningStatus?: string; // WARNING_1ST | WARNING_2ND | WARNING_3RD | MALICIOUS

  /** 고객 구분 필터: FARM(농가), DISTRIBUTION(유통) */
  @IsOptional()
  @IsString()
  customerType?: string;
}
