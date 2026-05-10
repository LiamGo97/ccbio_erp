import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReceivableWarningConfigDto {
  @IsEnum(['WARNING_1ST', 'WARNING_2ND', 'WARNING_3RD', 'MALICIOUS'])
  warningLevel!: 'WARNING_1ST' | 'WARNING_2ND' | 'WARNING_3RD' | 'MALICIOUS';

  @IsNumber()
  @Type(() => Number)
  daysThreshold!: number;

  @IsBoolean()
  @Type(() => Boolean)
  smsEnabled!: boolean;

  @IsBoolean()
  @Type(() => Boolean)
  smsDaily!: boolean;

  @IsOptional()
  @IsString()
  smsTemplateType?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsNumber()
  @Type(() => Number)
  order!: number;

  @IsBoolean()
  @Type(() => Boolean)
  isActive!: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  userId?: number | null;
}
