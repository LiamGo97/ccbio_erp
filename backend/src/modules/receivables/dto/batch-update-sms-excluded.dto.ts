import { IsArray, IsBoolean, IsString } from 'class-validator';

export class BatchUpdateSmsExcludedDto {
  @IsArray()
  @IsString({ each: true })
  customerIds: string[];

  @IsBoolean()
  smsExcluded: boolean;
}
