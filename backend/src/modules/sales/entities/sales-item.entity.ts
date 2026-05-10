import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Sales } from './sales.entity';
import { TradeContainer } from '../../trade-contracts/entities/trade-container.entity';

@Entity({ name: 'tb_sales_item' })
export class SalesItem {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'si_id' })
  id!: string;

  @Column({ name: 'sa_id', type: 'bigint', nullable: false })
  salesId!: string;

  @ManyToOne(() => Sales, (sales) => sales.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sa_id' })
  sales!: Sales;

  @Column({ name: 'co_id', type: 'bigint', nullable: false })
  containerId!: string;

  @ManyToOne(() => TradeContainer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'co_id' })
  container?: TradeContainer | null;

  @Column({ name: 'si_container_type', length: 20, nullable: true })
  containerType?: 'CONTAINER' | 'CARGO' | null;

  @Column({ name: 'si_cargo_bales', type: 'numeric', precision: 14, scale: 4, nullable: true })
  cargoBales?: string | null;

  @Column({ name: 'si_cargo_weight', type: 'numeric', precision: 14, scale: 4, nullable: true })
  cargoWeight?: string | null;

  @Column({ name: 'si_sto_cost', type: 'numeric', precision: 14, scale: 2, nullable: true })
  stoCost?: string | null;

  @Column({ name: 'si_dt_cost', type: 'numeric', precision: 14, scale: 2, nullable: true })
  dtCost?: string | null;

  @Column({ name: 'si_advance_payment_ratio', type: 'numeric', precision: 5, scale: 2, nullable: true })
  advancePaymentRatio?: string | null;

  // margin은 더 이상 저장하지 않음 - 계산 필드로 사용
  // @Column({ name: 'si_margin', type: 'numeric', precision: 14, scale: 2, nullable: true })
  // margin?: string | null;

  @Column({ name: 'si_sales_unit_price', type: 'numeric', precision: 14, scale: 2, nullable: true })
  salesUnitPrice?: string | null;

  @Column({ name: 'si_sales_unit_price_stage', length: 30, nullable: true })
  salesUnitPriceStage?: string | null; // 판매 단가 구분 (LOADING:상차, ARRIVAL:도착, UNLOADING:도착하역)

  /**
   * 마진 계산 (판매단가 - 원가 - 운송비)
   * 운송비는 sales 레벨에서 가져와야 하므로 Service에서 계산
   */
  calculateMargin(purchaseCost: number | null, transportFeePerKg: number = 0): number | null {
    if (!this.salesUnitPrice) return null;
    
    const salesUnitPriceNum = Number(this.salesUnitPrice);
    if (!purchaseCost) return null;
    
    const stoCost = this.stoCost ? Number(this.stoCost) : 0;
    const dtCost = this.dtCost ? Number(this.dtCost) : 0;
    
    // 마진 = 판매단가 - 원가 - 운송비(kg당) - STO비용 - DT비용 (작업비는 컨테이너 단일 소스)
    return salesUnitPriceNum - purchaseCost - transportFeePerKg - stoCost - dtCost;
  }

  @Column({ name: 'si_status', length: 30, nullable: true })
  status?: string | null;

  // 예약 관련 정보
  @Column({ name: 'si_reservation_date', type: 'date', nullable: true })
  reservationDate?: Date | null;

  @Column({ name: 'si_reservation_notes', type: 'text', nullable: true })
  reservationNotes?: string | null;

  @Column({ name: 'si_reservation_co_id', type: 'bigint', nullable: true })
  reservationCoId?: string | null;

  @ManyToOne(() => TradeContainer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'si_reservation_co_id' })
  reservationContainer?: TradeContainer | null;

  @Column({ name: 'si_info_changed_reason', type: 'text', nullable: true })
  infoChangedReason?: string | null;

  @CreateDateColumn({ name: 'si_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'si_updated_at' })
  updatedAt!: Date;
}

