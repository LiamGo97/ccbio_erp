import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { GetSalesDto } from './get-sales.dto';

/** 목록 필터와 동일한 조건 + dryRun(대상 건수만 조회) */
export class BackfillSalesUnloadingAddressDto extends GetSalesDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @Type(() => Boolean)
  @IsBoolean()
  dryRun?: boolean;
}
