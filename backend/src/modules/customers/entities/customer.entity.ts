import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Consultation } from '../../consultations/entities/consultation.entity';
import { Region } from '../../regions/entities/region.entity';
import { City } from '../../cities/entities/city.entity';
import { CustomerOperation } from './customer-operation.entity';
import { CustomerStatementName } from './customer-statement-name.entity';
import { CustomerDeliveryAddress } from './customer-delivery-address.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'tb_customer' })
export class Customer {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'cu_id' })
  id!: string;

  @Column({ name: 'cu_region_id', type: 'int', nullable: true })
  regionId?: number | null;

  @ManyToOne(() => Region, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cu_region_id' })
  regionEntity?: Region | null;

  @Column({ name: 'cu_postal_code', length: 10, nullable: true })
  postalCode?: string | null;

  @Column({ name: 'cu_address', length: 255, nullable: true })
  address?: string | null;

  @Column({ name: 'cu_address_detail', length: 255, nullable: true })
  addressDetail?: string | null;

  /** 도로명주소 (카카오 road_address.address_name 등) */
  @Column({ name: 'cu_address_road', type: 'varchar', length: 500, nullable: true })
  addressRoad?: string | null;

  /** 지번주소 (카카오 address.address_name 등) */
  @Column({ name: 'cu_address_jibun', type: 'varchar', length: 500, nullable: true })
  addressJibun?: string | null;

  /** 기본주소 구분: ROAD | JIBUN 등 (쇼핑몰 us_address_default_type 대응) */
  @Column({ name: 'cu_address_default_type', type: 'varchar', length: 50, nullable: true })
  addressDefaultType?: string | null;

  @Column({ name: 'cu_city_id', type: 'int', nullable: true })
  cityId?: number | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cu_city_id' })
  cityEntity?: City | null;

  @Column({ name: 'cu_company_name', length: 150, nullable: true })
  companyName?: string | null;

  @Column({ name: 'cu_ceo', length: 100, nullable: true })
  ceo?: string | null;

  @Column({ name: 'cu_phone', length: 50, nullable: true })
  phone?: string | null;

  @Column({ name: 'cu_species', length: 100, nullable: true })
  species?: string | null;

  @Column({ name: 'cu_feeding', length: 100, nullable: true })
  feeding?: string | null;

  /** 이커머스 축종 코드 원본 (콤마 구분 가능) */
  @Column({ name: 'cu_livestock_types', type: 'varchar', length: 200, nullable: true })
  livestockTypes?: string | null;

  /** 이커머스 운영방식 코드 원본 */
  @Column({ name: 'cu_operation_method', type: 'varchar', length: 100, nullable: true })
  operationMethod?: string | null;

  /** 이커머스 급여방식 코드 원본 */
  @Column({ name: 'cu_feeding_method', type: 'varchar', length: 100, nullable: true })
  feedingMethod?: string | null;

  /** 이커머스 사육/착유 두수 원본 */
  @Column({ name: 'cu_livestock_count', type: 'int', nullable: true })
  livestockCount?: number | null;

  @Column({ name: 'cu_chamcham_status', length: 50, nullable: true })
  chamchamStatus?: string | null;

  /** 신규몰(Chamcharm) 연동 참참회원 여부 — tb_code CHAMCHARM_MEMBER_STATUS (기존 참참회원 여부와 별도) */
  @Column({ name: 'cu_chamcharm_member_status', type: 'varchar', length: 50, nullable: true })
  chamcharmMemberStatus?: string | null;

  @Column({ name: 'cu_sms_excluded', type: 'boolean', default: false })
  smsExcluded?: boolean;

  /** 이벤트 SMS에 응답(참여)한 고객 여부 (cu_event_sms_responded) */
  @Column({ name: 'cu_event_sms_responded', type: 'boolean', default: false })
  eventSmsResponded?: boolean;

  /** 고객 구분: FARM(농가), DISTRIBUTION(유통). tb_code 그룹 CUSTOMER_TYPE */
  @Column({ name: 'cu_customer_type', length: 20, nullable: true, default: 'FARM' })
  customerType?: string | null;

  /** 이커머스 회원구분: NON_BUSINESS, BUSINESS. tb_code 그룹 MEMBER_TYPE */
  @Column({ name: 'cu_member_type', type: 'varchar', length: 20, nullable: true })
  memberType?: string | null;

  /** 사업자등록번호 (하이픈 포함 가능) */
  @Column({ name: 'cu_business_registration_number', type: 'varchar', length: 20, nullable: true })
  businessRegistrationNumber?: string | null;

  /** 사업자등록증 Google Drive 파일 ID */
  @Column({ name: 'cu_business_cert_google_drive_file_id', type: 'varchar', length: 255, nullable: true })
  businessCertGoogleDriveFileId?: string | null;

  /** 사업자등록증 파일명 */
  @Column({ name: 'cu_business_cert_file_name', type: 'varchar', length: 255, nullable: true })
  businessCertFileName?: string | null;

  /** 쇼핑몰 회원 ID (tb_user.us_id 등, 연동 시) */
  @Column({ name: 'cu_mall_user_id', type: 'bigint', nullable: true })
  mallUserId?: string | null;

  /** 법정동코드 10자리 (카카오 지번 address.b_code) */
  @Column({ name: 'cu_legal_b_code', type: 'char', length: 10, nullable: true })
  legalBCode?: string | null;

  /** 비고(담당자·내부 메모) */
  @Column({ name: 'cu_remarks', type: 'text', nullable: true })
  remarks?: string | null;

  /** 비사업자 본인확인용(주민등록번호, 마스킹·암호화는 별도 정책) */
  @Column({ name: 'cu_resident_registration_number', type: 'varchar', length: 32, nullable: true })
  residentRegistrationNumber?: string | null;

  @Column({ name: 'cu_farm_management_cert_google_drive_file_id', type: 'varchar', length: 255, nullable: true })
  farmManagementCertGoogleDriveFileId?: string | null;

  @Column({ name: 'cu_farm_management_cert_file_name', type: 'varchar', length: 255, nullable: true })
  farmManagementCertFileName?: string | null;

  @Column({ name: 'cu_refund_bank_name', type: 'varchar', length: 100, nullable: true })
  refundBankName?: string | null;

  @Column({ name: 'cu_refund_account_number', type: 'varchar', length: 64, nullable: true })
  refundAccountNumber?: string | null;

  @Column({ name: 'cu_refund_depositor', type: 'varchar', length: 100, nullable: true })
  refundDepositor?: string | null;

  @Column({ name: 'cu_sales_manager_user_id', type: 'int', nullable: true })
  salesManagerUserId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cu_sales_manager_user_id' })
  salesManagerUser?: User | null;

  @CreateDateColumn({ name: 'cu_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'cu_updated_at' })
  updatedAt!: Date;

  @OneToMany(() => Consultation, (consultation) => consultation.customer)
  consultations?: Consultation[];

  /** 목록 조회 시 relation count 매핑용(DB 컬럼 아님) */
  consultationCount?: number;

  @OneToMany(() => CustomerOperation, (operation) => operation.customer)
  operations?: CustomerOperation[];

  /** 거래명세서 발행 시 사용할 이름/연락처 목록 */
  @OneToMany(() => CustomerStatementName, (sn) => sn.customer, { cascade: true })
  statementNames?: CustomerStatementName[];

  /** 배송(납품) 주소록 */
  @OneToMany(() => CustomerDeliveryAddress, (a) => a.customer)
  deliveryAddresses?: CustomerDeliveryAddress[];
}


