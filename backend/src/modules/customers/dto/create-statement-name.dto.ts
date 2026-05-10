import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStatementNameDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  companyName?: string;

  @IsString()
  @MaxLength(150)
  displayName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  contactPhone?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
