import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateReceivableWarningConfigDto {
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
