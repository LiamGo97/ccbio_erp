import { IsString, IsNumber, Min, IsNotEmpty, IsOptional, IsInt } from 'class-validator';

export class CreateCodeDto {
  @IsString()
  @IsNotEmpty()
  group: string; // 코드 그룹

  @IsString()
  @IsNotEmpty()
  name: string; // 표시명

  @IsString()
  @IsOptional()
  value?: string; // 실제 코드 값

  @IsNumber()
  @Min(0)
  @IsOptional()
  order?: number; // 정렬 순서

  @IsInt()
  @IsOptional()
  parentId?: number | null; // 부모 ID

  @IsString()
  @IsOptional()
  aliases?: string; // AI 별칭
}

