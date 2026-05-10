import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TradeOrder } from './trade-order.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'tb_trade_contract' })
export class TradeContract {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'tc_id' })
  id!: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'us_id' })
  createdBy?: User | null;

  /** DB: 삭제된 계약과 번호 재사용 허용 → 부분 유니크 인덱스(uq_trade_contract_contract_no_active) */
  @Column({ name: 'tc_contract_no', nullable: true })
  contractNo?: string | null;

  @Column({ name: 'tc_exporter', nullable: true })
  exporter?: string | null;

  @Column({ name: 'tc_export_country', nullable: true })
  exportCountry?: string | null;

  @Column({ name: 'tc_quota', nullable: true })
  quota?: string | null;

  @Column({ name: 'tc_fumigation', nullable: true })
  fumigation?: string | null;

  @Column({ name: 'tc_customs_duty', nullable: true })
  customsDuty?: string | null;

  @Column({ name: 'tc_product_name', nullable: true })
  productName?: string | null;

  @Column({ name: 'tc_contract_google_drive_file_id', nullable: true })
  contractGoogleDriveFileId?: string | null;

  @Column({ name: 'tc_contract_file_name', nullable: true })
  contractFileName?: string | null;

  @Column({ name: 'tc_status', type: 'varchar', length: 20, nullable: true })
  status?: string | null;

  // 발주 기본 정보
  @Column({ name: 'tc_order_date', type: 'date', nullable: true })
  orderDate?: Date | null;

  // 선적 정보
  @Column({ name: 'tc_shipping_line', nullable: true })
  shippingLine?: string | null;

  // 상품 정보
  @Column({ name: 'tc_grade', nullable: true })
  grade?: string | null;
  @Column({ name: 'tc_quantity', type: 'numeric', precision: 14, scale: 4, nullable: true })
  quantity?: string | null;
  @Column({ name: 'tc_packing_type', nullable: true })
  packingType?: string | null;

  // 가격 정보
  @Column({ name: 'tc_unit_price', type: 'numeric', precision: 14, scale: 4, nullable: true })
  unitPrice?: string | null;
  @Column({ name: 'tc_currency', nullable: true })
  currency?: string | null;
  @Column({ name: 'tc_commission_dollar', nullable: true })
  commissionDollar?: string | null;
  @Column({ name: 'tc_commission_month', nullable: true })
  commissionMonth?: string | null;

  // 기타 정보
  @Column({ name: 'tc_destination', nullable: true })
  destination?: string | null;
  @Column({ name: 'tc_notes', type: 'text', nullable: true })
  notes?: string | null;
  @Column({ name: 'tc_new_old', nullable: true })
  newOld?: string | null;

  @Column({ name: 'tc_total_order_count', type: 'int', nullable: true })
  totalOrderCount?: number | null; // 계약에 계획된 전체 부킹(주문) 개수

  @Column({ name: 'tc_monthly_order_plan', type: 'json', nullable: true })
  monthlyOrderPlan?: Record<string, number> | null; // 월별 계획 { "YYYY-MM": count }

  @DeleteDateColumn({ name: 'tc_deleted_at' })
  deletedAt?: Date | null;

  @Column({ name: 'tc_deleted_by_us_id', type: 'int', nullable: true })
  deletedByUserId?: number | null;

  @CreateDateColumn({ name: 'tc_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'tc_updated_at' })
  updatedAt!: Date;

  @OneToMany(() => TradeOrder, (order) => order.contract, {
    cascade: false,
  })
  orders?: TradeOrder[];
}


