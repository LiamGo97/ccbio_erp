import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsNumber } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SendSmsRecipientDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SendSmsRecipientDto)
  recipients: SendSmsRecipientDto[];

  @IsString()
  @IsOptional()
  sender?: string; // 발신번호 (기본값은 환경변수에서)

  @IsString()
  @IsOptional()
  imageUrl?: string; // MMS 1번 이미지 URL (알리고 `image` 필드)

  @IsString()
  @IsOptional()
  imageUrl2?: string; // MMS 2번 이미지 URL (알리고 `image2` 필드, 거래명세서 첨부 등)

  // SMS 이력 저장용 추가 필드
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => value ? Number(value) : undefined)
  templateId?: number; // 사용한 템플릿 ID

  @IsString()
  @IsOptional()
  templateType?: string; // 템플릿 타입 (예: 'INVOICE')

  @IsString()
  @IsOptional()
  templateContent?: string; // 원본 템플릿 내용

  @IsString()
  @IsOptional()
  imagePath?: string; // GCS 이미지 경로 (1번)

  @IsString()
  @IsOptional()
  imagePath2?: string; // GCS 이미지 경로 (2번)

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => value ? Number(value) : undefined)
  invoiceId?: number; // 연관된 거래명세서 ID

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => value ? Number(value) : undefined)
  senderUserId?: number; // 발송 담당자 ID

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => value ? Number(value) : undefined)
  createdById?: number; // 발송 요청자 ID

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => value ? Number(value) : undefined)
  relatedId?: number; // 기타 연관 ID

  @IsString()
  @IsOptional()
  relatedType?: string; // 연관 타입 코드 값
}

