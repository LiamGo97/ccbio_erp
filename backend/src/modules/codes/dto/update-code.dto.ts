import { IsString, IsOptional, IsNumber, Min, IsNotEmpty, ValidateIf, IsInt } from 'class-validator';

export class UpdateCodeDto {
  @IsString()
  @IsOptional()
  group?: string;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.name !== undefined)
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsOptional()
  value?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  order?: number;

  @IsInt()
  @IsOptional()
  parentId?: number | null;

  @IsString()
  @IsOptional()
  aliases?: string;
}


