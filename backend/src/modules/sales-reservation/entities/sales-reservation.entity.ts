import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { Warehouse } from '../../warehouse/entities/warehouse.entity';
import { TradeOrder } from '../../trade-contracts/entities/trade-order.entity';
import { TradeContainer } from '../../trade-contracts/entities/trade-container.entity';

@Entity({ name: 'tb_sales_reservation' })
export class SalesReservation {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'sres_id' })
  id!: string;

  @Column({ name: 'cu_id', type: 'bigint', nullable: true })
  customerId?: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer | null;

  @Column({ name: 'sres_bl', length: 64, nullable: true })
  bl?: string | null;

  @Column({ name: 'to_id', type: 'bigint', nullable: true })
  tradeOrderId?: string | null;

  @ManyToOne(() => TradeOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'to_id' })
  tradeOrder?: TradeOrder | null;

  @Column({ name: 'co_id', type: 'bigint', nullable: true })
  containerId?: string | null;

  @ManyToOne(() => TradeContainer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'co_id' })
  container?: TradeContainer | null;

  @Column({ name: 'sres_contact_phone', length: 50, nullable: true })
  contactPhone?: string | null;

  @Column({ name: 'sres_requested_qty', type: 'numeric', precision: 14, scale: 4, nullable: true })
  requestedQty?: string | null;

  @Column({ name: 'sres_qty_unit', length: 20, nullable: true })
  qtyUnit?: string | null;

  @Column({ name: 'sres_vehicle_type', length: 50, nullable: true })
  vehicleType?: string | null;

  @Column({ name: 'sres_loading_warehouse_id', type: 'int', nullable: true })
  loadingWarehouseId?: number | null;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sres_loading_warehouse_id', referencedColumnName: 'id' })
  loadingWarehouse?: Warehouse | null;

  @Column({ name: 'sres_loading_warehouse_text', length: 100, nullable: true })
  loadingWarehouseText?: string | null;

  @Column({ name: 'sres_customs_date', type: 'date', nullable: true })
  customsDate?: Date | null;

  @Column({ name: 'sres_loading_date', type: 'date', nullable: true })
  loadingDate?: Date | null;

  @Column({ name: 'sres_loading_schedule_note', type: 'text', nullable: true })
  loadingScheduleNote?: string | null;

  @Column({ name: 'sres_remarks', type: 'text', nullable: true })
  remarks?: string | null;

  @Column({ name: 'sres_unit_price', type: 'numeric', precision: 14, scale: 2, nullable: true })
  unitPrice?: string | null;

  /** 판매 단가 구분 (코드마스터 SALES_PRICE_STAGE, 판매 등록과 동일) */
  @Column({ name: 'sres_unit_price_stage', length: 50, nullable: true })
  unitPriceStage?: string | null;

  @Column({ name: 'sres_reference', type: 'text', nullable: true })
  reference?: string | null;

  @Column({ name: 'sres_sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'sres_status', length: 20, default: 'ACTIVE' })
  status!: string;

  @Column({ name: 'us_id', type: 'int', nullable: true })
  registeredById?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'us_id' })
  registeredByUser?: User | null;

  @CreateDateColumn({ name: 'sres_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'sres_updated_at' })
  updatedAt!: Date;
}
