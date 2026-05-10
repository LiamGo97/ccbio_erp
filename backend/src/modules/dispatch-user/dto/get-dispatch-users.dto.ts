import { IsOptional, IsInt, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class GetDispatchUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dispatchCompanyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  search?: string;
}

