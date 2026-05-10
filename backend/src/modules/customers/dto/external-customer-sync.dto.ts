import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExternalCustomerSyncFarmDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  livestockTypes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  operationMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  feedingMethod?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  livestockCount?: number;
}

export class ExternalCustomerSyncBusinessDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  businessRegistrationNumber?: string;
}

/** 몰(이커머스) → ERP POST /api/external/customers/sync 요청 본문 */
export class ExternalCustomerSyncDto {
  @Type(() => Number)
  @IsNumber()
  mallUserId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  /** 몰 스펙 호환용. ERP tb_customer에는 저장하지 않음. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  memberType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressRoad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressJibun?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  regionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  dongName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phoneLandline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressDefaultType?: string;

  /**
   * 법정동코드 10자리(숫자만, 공백 무시). 카카오 주소 API b_code 등. 생략 시 ERP 기존 값 유지(신규는 NULL).
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  legalBCode?: string;

  /**
   * 신규몰(Chamcharm) 참참회원 여부 — tb_code 그룹 CHAMCHARM_MEMBER_STATUS 의 표시명(cd_name) 또는 코드값(cd_value).
   * 생략 시 ERP가 CHAMCHARM_MEMBER_STATUS에서 기본 참참회원 코드를 자동 적용(회원가입·수정 동기화 모두).
   * 기존 ERP `참참회원 여부`(CHAMCHAM_STATUS)와 별도 컬럼(cu_chamcharm_member_status)에 저장.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  chamcharmMemberStatus?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalCustomerSyncFarmDto)
  farm?: ExternalCustomerSyncFarmDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalCustomerSyncBusinessDto)
  business?: ExternalCustomerSyncBusinessDto;
}
