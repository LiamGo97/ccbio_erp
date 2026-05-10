import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateFreeTimeDto {
  @IsString()
  @Length(1, 64)
  exporterCode!: string;

  @IsString()
  @Length(1, 64)
  shippingLineCode!: string;

  @IsString()
  @IsIn(['DM', 'DT', 'CB'])
  type!: string;

  @IsDateString()
  baseDate!: string;

  @IsOptional()
  @IsString()
  value?: string | null;
}



