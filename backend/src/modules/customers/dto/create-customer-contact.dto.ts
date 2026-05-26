import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomerContactDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationship?: string | null;
}
