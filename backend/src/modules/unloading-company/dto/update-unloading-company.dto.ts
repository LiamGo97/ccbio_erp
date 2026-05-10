import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, Length } from 'class-validator';
import { CreateUnloadingCompanyDto } from './create-unloading-company.dto';

export class UpdateUnloadingCompanyDto extends PartialType(CreateUnloadingCompanyDto) {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  contact?: string;
}

