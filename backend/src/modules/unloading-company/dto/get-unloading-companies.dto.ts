import { IsOptional, IsString } from 'class-validator';

export class GetUnloadingCompaniesDto {
  @IsOptional()
  @IsString()
  search?: string;
}

