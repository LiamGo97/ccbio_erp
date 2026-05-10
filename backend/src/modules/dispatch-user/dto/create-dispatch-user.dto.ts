import { IsInt, IsString, IsOptional, IsBoolean, Length } from 'class-validator';

export class CreateDispatchUserDto {
  @IsInt()
  userId: number;

  @IsInt()
  dispatchCompanyId: number;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  position?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}

