import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TradeOrder } from './trade-order.entity';

@Entity({ name: 'tb_trade_order_inbound' })
@Unique(['order', 'status'])
export class TradeOrderInbound {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'ti_id' })
  id!: string;

  @ManyToOne(() => TradeOrder, (order) => order.inbounds, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ti_order_id' })
  order!: TradeOrder;

  // 입고 데이터 필드
  @Column({ name: 'ti_do_cost', type: 'numeric', precision: 14, scale: 4, nullable: true })
  doCost?: string | null;

  @Column({ name: 'ti_customs_fee', type: 'numeric', precision: 14, scale: 4, nullable: true })
  customsFee?: string | null;

  @Column({ name: 'ti_quarantine_agency_fee', type: 'numeric', precision: 14, scale: 4, nullable: true })
  quarantineAgencyFee?: string | null;

  @Column({ name: 'ti_customs_duty', type: 'numeric', precision: 14, scale: 4, nullable: true })
  customsDuty?: string | null;

  @Column({ name: 'ti_spot', type: 'numeric', precision: 14, scale: 4, nullable: true })
  spot?: string | null;

  @Column({ name: 'ti_additional_item', type: 'numeric', precision: 14, scale: 4, nullable: true })
  additionalItem?: string | null;

  @Column({ name: 'ti_bank_fee', type: 'numeric', precision: 14, scale: 4, nullable: true })
  bankFee?: string | null;

  @Column({ name: 'ti_quarantine_work_cost', type: 'numeric', precision: 14, scale: 4, nullable: true })
  quarantineWorkCost?: string | null;

  @Column({ name: 'ti_sto', type: 'numeric', precision: 14, scale: 4, nullable: true })
  sto?: string | null;

  @Column({ name: 'ti_fumigation_quarantine', type: 'numeric', precision: 14, scale: 4, nullable: true })
  fumigationQuarantine?: string | null;

  @Column({ name: 'ti_document', type: 'numeric', precision: 14, scale: 4, nullable: true })
  document?: string | null;

  @Column({ name: 'ti_igobi', type: 'numeric', precision: 14, scale: 4, nullable: true })
  igobi?: string | null;

  @Column({ name: 'ti_extraction_fee', type: 'numeric', precision: 14, scale: 4, nullable: true })
  extractionFee?: string | null;

  @Column({ name: 'ti_first_tier_loading_fee', type: 'numeric', precision: 14, scale: 4, nullable: true })
  firstTierLoadingFee?: string | null;

  @Column({ name: 'ti_fee', type: 'numeric', precision: 14, scale: 4, nullable: true })
  fee?: string | null;

  @Column({ name: 'ti_sample_collection', type: 'numeric', precision: 14, scale: 4, nullable: true })
  sampleCollection?: string | null;

  @Column({ name: 'ti_quota_cost', type: 'numeric', precision: 14, scale: 4, nullable: true })
  quotaCost?: string | null;

  @Column({ name: 'ti_warehouse', nullable: true })
  warehouse?: string | null;

  @Column({ name: 'ti_igodate', type: 'date', nullable: true })
  igodate?: Date | null;

  @Column({ name: 'ti_quarantine_date', type: 'date', nullable: true })
  quarantineDate?: Date | null;

  @Column({ name: 'ti_dt_date', type: 'date', nullable: true })
  dtDate?: Date | null;

  @Column({ name: 'ti_day_exchange_rate', type: 'numeric', precision: 14, scale: 4, nullable: true })
  dayExchangeRate?: string | null;

  @Column({ name: 'ti_comparison_exchange_rate', type: 'numeric', precision: 14, scale: 4, nullable: true })
  comparisonExchangeRate?: string | null;

  @Column({ name: 'ti_applied_exchange_rate', type: 'numeric', precision: 14, scale: 4, nullable: true })
  appliedExchangeRate?: string | null;

  @Column({ name: 'ti_comparison_purchase_cost', type: 'numeric', precision: 14, scale: 4, nullable: true })
  comparisonPurchaseCost?: string | null;

  @Column({ name: 'ti_purchase_cost', type: 'numeric', precision: 14, scale: 4, nullable: true })
  purchaseCost?: string | null;

  @Column({ name: 'ti_target_margin', type: 'numeric', precision: 14, scale: 4, nullable: true })
  targetMargin?: string | null;

  @Column({ name: 'ti_status', type: 'varchar', length: 20, nullable: true, default: 'PENDING' })
  status?: 'PENDING' | 'CONFIRMED' | null;

  @CreateDateColumn({ name: 'ti_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'ti_updated_at' })
  updatedAt!: Date;
}

