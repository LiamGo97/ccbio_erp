import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class CustomerContactItemDto {
  /** 기존 행 수정 시 tb_customer_contact.cct_id */
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'id must be numeric' })
  id?: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationship?: string | null;
}
