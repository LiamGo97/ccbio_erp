import { IsString, IsOptional, IsDateString } from 'class-validator';

export class GetCustomerLedgerDto {
  @IsString()
  @IsOptional()
  startDate?: string; // YYYY-MM-DD

  @IsString()
  @IsOptional()
  endDate?: string; // YYYY-MM-DD
}
