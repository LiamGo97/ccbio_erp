import { PartialType } from '@nestjs/mapped-types';
import { CreateMallDailyStatDto } from './create-mall-daily-stat.dto';

export class UpdateMallDailyStatDto extends PartialType(CreateMallDailyStatDto) {}
