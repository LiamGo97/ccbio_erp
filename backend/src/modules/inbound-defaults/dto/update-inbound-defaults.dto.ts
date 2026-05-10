import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateInboundDefaultsDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  defaultExchangeRateUsd: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  defaultExchangeRateEur: number;
}
