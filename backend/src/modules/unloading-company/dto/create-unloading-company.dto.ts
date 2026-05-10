import { IsString, IsOptional, Length } from 'class-validator';

export class CreateUnloadingCompanyDto {
  @IsString()
  @Length(1, 100)
  representativeName: string;

  @IsString()
  @Length(1, 50)
  contact: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

