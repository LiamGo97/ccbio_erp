import { IsString, IsOptional, IsBoolean, Length, Matches } from 'class-validator';

export class CreateSmsSenderDto {
  @IsString()
  @Length(1, 20)
  @Matches(/^[0-9-]+$/, { message: '전화번호는 숫자와 하이픈(-)만 사용할 수 있습니다.' })
  phone: string;

  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
