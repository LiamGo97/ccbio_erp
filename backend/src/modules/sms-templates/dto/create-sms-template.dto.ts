import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class CreateSmsTemplateDto {
  @IsString()
  @IsNotEmpty()
  type: string; // 템플릿 타입 코드 값

  @IsString()
  @IsNotEmpty()
  name: string; // 템플릿 이름

  @IsString()
  @IsNotEmpty()
  content: string; // 템플릿 내용

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TokenDto)
  availableTokens?: TokenDto[]; // 사용 가능한 토큰 목록

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number | null; // 공급자 ID (null이면 기본 템플릿)

  @IsOptional()
  @IsString()
  sender?: string | null; // 발신번호 (템플릿별 발신번호 설정)
}
