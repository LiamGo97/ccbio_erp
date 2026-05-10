import { IsString, IsOptional, IsBoolean, Length } from 'class-validator';

export class CreateDispatchCompanyDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}

