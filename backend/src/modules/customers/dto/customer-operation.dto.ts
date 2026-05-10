import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class CustomerOperationDto {
  @IsString()
  @IsIn(['COMPANY', 'BEEF', 'DAIRY', 'HORSE', 'GOAT'])
  operation!: string; // 'COMPANY' | 'BEEF' | 'DAIRY' | 'HORSE' | 'GOAT'

  @IsString()
  @IsOptional()
  @IsIn(['INTEGRATED', 'BREEDING', 'FATTENING', 'RAISING', 'MILKING', 'DRY_MILKING'])
  operationSub?: string | null; // 'INTEGRATED' | 'BREEDING' | 'FATTENING' | 'RAISING' | 'MILKING' | 'DRY_MILKING' | null

  @IsNumber()
  @IsOptional()
  herdSize?: number | null;
}

