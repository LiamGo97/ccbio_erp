import {
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CustomerOperationDto } from './customer-operation.dto';
import { CustomerContactItemDto } from './customer-contact-item.dto';

export class CreateCustomerDto {
  @IsString()
  @IsOptional()
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressRoad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressJibun?: string;

  /** ROAD | JIBUN 등 (쇼핑몰 기본주소 구분) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  addressDefaultType?: string;

  /** 법정동코드 10자리 */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  legalBCode?: string;

  @IsString()
  @IsOptional()
  addressDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  ceo?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  species?: string;

  @IsString()
  @IsOptional()
  operation?: string;

  @IsString()
  @IsOptional()
  herdSize?: string;

  @IsString()
  @IsOptional()
  feeding?: string;

  /** 이커머스 축종 코드 원본 (콤마 구분 가능: HANWOO,NAKWOO 등) */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  livestockTypes?: string;

  /** 이커머스 운영방식 코드 원본 (BREEDING/FATTENING/...) */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  operationMethod?: string;

  /** 이커머스 급여방식 코드 원본 (SELF_MIX/DIRECT/TMF) */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  feedingMethod?: string;

  /** 이커머스 사육/착유 두수 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  livestockCount?: number;

  @IsString()
  @IsOptional()
  chamchamStatus?: string;

  /** 신규몰 Chamcharm 참참회원 여부 — tb_code CHAMCHARM_MEMBER_STATUS (한글명 또는 cd_value) */
  @IsString()
  @IsOptional()
  @MaxLength(50)
  chamcharmMemberStatus?: string;

  /** 고객 구분: 농가, 유통 (한글명 또는 FARM, DISTRIBUTION) */
  @IsString()
  @IsOptional()
  customerType?: string;

  /** 이커머스 회원구분: 비사업자/사업자 (한글명 또는 NON_BUSINESS, BUSINESS). tb_code MEMBER_TYPE */
  @IsString()
  @IsOptional()
  @MaxLength(20)
  memberType?: string;

  /** 회원등급 — tb_code CUSTOMER_GRADE (표시명 또는 cd_value) */
  @IsString()
  @IsOptional()
  @MaxLength(50)
  customerGrade?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  businessRegistrationNumber?: string;

  /** 사업자등록증 Google Drive 파일 ID */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  businessCertGoogleDriveFileId?: string;

  /** 사업자등록증 파일명 */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  businessCertFileName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  residentRegistrationNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  farmManagementCertGoogleDriveFileId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  farmManagementCertFileName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  refundBankName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  refundAccountNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  refundDepositor?: string;

  /** tb_user.us_id, 미선택 시 null */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '' || value === '__none__') {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  })
  @ValidateIf((_, v) => v != null)
  @IsInt()
  @Min(1)
  salesManagerUserId?: number | null;

  /** 쇼핑몰 회원 ID (숫자 문자열) */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  mallUserId?: string;

  /** 이벤트 SMS 응답(참여) 여부 */
  @IsBoolean()
  @IsOptional()
  eventSmsResponded?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  remarks?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomerOperationDto)
  operations?: CustomerOperationDto[]; // 운영방식 배열

  /** 연락처·관계 목록 (저장 시 전체 동기화) */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomerContactItemDto)
  contacts?: CustomerContactItemDto[];
}


