import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TradeOrder } from './trade-order.entity';

@Entity({ name: 'tb_container' })
@Unique(['order', 'containerNo'])
export class TradeContainer {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'co_id' })
  id!: string;

  @ManyToOne(() => TradeOrder, (order) => order.containers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'co_order_id' })
  order!: TradeOrder;

  @Column({ name: 'co_container_no', length: 64 })
  containerNo!: string;

  @Column({ name: 'co_product', length: 100, nullable: true })
  product?: string | null;

  @Column({ name: 'co_trade_grade', length: 100, nullable: true })
  tradeGrade?: string | null;

  @Column({ name: 'co_sales_grade', length: 100, nullable: true })
  salesGrade?: string | null;

  @Column({ name: 'co_packing_type', length: 100, nullable: true })
  packingType?: string | null;

  @Column({ name: 'co_currency', length: 10, nullable: true })
  currency?: string | null;

  @Column({ name: 'co_unit_price', type: 'numeric', precision: 14, scale: 4, nullable: true })
  unitPrice?: string | null;

  @Column({ name: 'co_weight', type: 'numeric', precision: 14, scale: 4, nullable: true })
  weight?: string | null;

  /** 무역 베일수(문서/계약 기준). 등급(tradeGrade)과 동일 패턴 */
  @Column({ name: 'co_trade_bales', type: 'numeric', precision: 14, scale: 4, nullable: true })
  tradeBales?: string | null;

  /** 영업 베일수. NULL이면 무역 베일(tradeBales)과 동일. 스몰베일 시 수식 적용값 */
  @Column({ name: 'co_sales_bales', type: 'numeric', precision: 14, scale: 4, nullable: true })
  salesBales?: string | null;

  @Column({ name: 'co_pending_purchase_cost', type: 'numeric', precision: 14, scale: 6, nullable: true })
  pendingPurchaseCost?: string | null;

  @Column({ name: 'co_confirmed_purchase_cost', type: 'numeric', precision: 14, scale: 6, nullable: true })
  confirmedPurchaseCost?: string | null;

  @Column({ name: 'co_final_purchase_cost', type: 'numeric', precision: 14, scale: 6, nullable: true })
  finalPurchaseCost?: string | null;

  @Column({ name: 'co_inventory_status', length: 30, nullable: true, default: 'AVAILABLE' })
  inventoryStatus?: 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null;

  @Column({ name: 'co_sto_cost', type: 'numeric', precision: 14, scale: 2, nullable: true })
  stoCost?: string | null;

  @Column({ name: 'co_dt_cost', type: 'numeric', precision: 14, scale: 2, nullable: true })
  dtCost?: string | null;

  @Column({ name: 'co_work_fee', type: 'numeric', precision: 14, scale: 2, nullable: true })
  workFee?: string | null;

  /** 현장 작업비(원) — 창고 작업비와 합산 후 kg당 원가에 반영 */
  @Column({ name: 'co_onsite_work_fee', type: 'numeric', precision: 14, scale: 2, nullable: true })
  onsiteWorkFee?: string | null;

  @Column({ name: 'co_sequence', type: 'integer', nullable: false, default: 1 })
  sequence!: number;

  /** true면 재고 목록·판매 항목 선택에서 제외 (삭제 아님, 제외 해제로 복구 가능) */
  @Column({ name: 'co_exclude_from_inventory_yn', type: 'boolean', nullable: true, default: false })
  excludeFromInventory?: boolean;

  /** true면 이 컨테이너만 쉽백(반송). 일부 통관·일부 쉽백 시 사용 */
  @Column({ name: 'co_ship_back_yn', type: 'boolean', nullable: true, default: false })
  shipBack?: boolean;

  /** 반납여부 (tb_code CONTAINER_RETURN_STATUS) */
  @Column({ name: 'co_return_status', length: 20, nullable: true, default: 'NOT_RETURNED' })
  returnStatus?: 'NOT_RETURNED' | 'RETURNED' | 'LEASED' | 'LEASED_ENDED' | null;

  /** 컨테이너 비고 (재고 확정 등) */
  @Column({ name: 'co_notes', type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'co_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'co_updated_at' })
  updatedAt!: Date;
}


