import { IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMallDailyStatDto {
  @IsDateString()
  statDate: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalVisitors: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  visits: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  newVisitors: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  returningVisitors: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  pageViews: number;

  @Type(() => Number)
  @IsInt()
  appInstalls: number; // 음수 가능 (순감)

  @Type(() => Number)
  @IsInt()
  @Min(0)
  memberSignups: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  salesCount: number;
}
