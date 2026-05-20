import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { SalesItem } from './sales-item.entity';

@Entity({ name: 'tb_sales' })
export class Sales {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'sa_id' })
  id!: string;

  @Column({ name: 'cu_id', type: 'bigint', nullable: true })
  customerId?: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer | null;

  @Column({ name: 'sa_reservation_date', type: 'date', nullable: true })
  reservationDate?: Date | null;

  @Column({ name: 'sa_sales_date', type: 'date', nullable: true })
  salesDate?: Date | null;

  @Column({ name: 'sa_request_vehicle', length: 50, nullable: true })
  requestVehicle?: string | null;

  @Column({ name: 'sa_transport_fee', type: 'decimal', precision: 12, scale: 2, nullable: true })
  transportFee?: number | null;

  // 하차지 주소
  @Column({ name: 'sa_unloading_postal_code', length: 10, nullable: true })
  unloadingPostalCode?: string | null;

  @Column({ name: 'sa_unloading_address', type: 'text', nullable: true })
  unloadingAddress?: string | null;

  @Column({ name: 'sa_unloading_address_detail', type: 'text', nullable: true })
  unloadingAddressDetail?: string | null;

  @Column({ name: 'sa_unloading_region', length: 100, nullable: true })
  unloadingRegion?: string | null;

  @Column({ name: 'sa_unloading_city', length: 50, nullable: true })
  unloadingCity?: string | null;

  /** 하차지 도로명 주소 (레거시 sa_unloading_address와 병행) */
  @Column({ name: 'sa_unloading_address_road', type: 'varchar', length: 500, nullable: true })
  unloadingAddressRoad?: string | null;

  /** 하차지 지번 주소 */
  @Column({ name: 'sa_unloading_address_jibun', type: 'varchar', length: 500, nullable: true })
  unloadingAddressJibun?: string | null;

  /** 하차지 법정동코드 (카카오 address.b_code 등) */
  @Column({ name: 'sa_unloading_legal_b_code', type: 'varchar', length: 10, nullable: true })
  unloadingLegalBCode?: string | null;

  @Column({ name: 'us_id', type: 'int', nullable: true })
  registeredBy?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'us_id' })
  registeredByUser?: User | null;

  @OneToMany(() => SalesItem, (item) => item.sales, { cascade: true })
  items!: SalesItem[];

  @Column({ name: 'sa_invoice_status', length: 20, nullable: true })
  invoiceStatus?: 'PENDING_ISSUE' | 'ISSUED' | null;

  /** 판매 상태 (취소 전 상태, tb_code SALES_STATUS: RESERVED, SOLD, COMPLETED) */
  @Column({ name: 'sa_status', length: 30, nullable: true })
  status?: 'RESERVED' | 'SOLD' | 'COMPLETED' | null;

  /** 판매 취소 시점 (null = 미취소) */
  @Column({ name: 'sa_cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  /** 판매 취소 사유 */
  @Column({ name: 'sa_cancellation_reason', type: 'text', nullable: true })
  cancellationReason?: string | null;

  // 선입금 정보 (판매 전체 기준)
  @Column({ name: 'sa_advance_payment_ratio', type: 'numeric', precision: 5, scale: 2, nullable: true })
  advancePaymentRatio?: string | null;

  @Column({ name: 'sa_advance_payment_amount', type: 'numeric', precision: 16, scale: 2, nullable: true })
  advancePaymentAmount?: string | null;

  /** 판매 비고 (운송·하차 참고) */
  @Column({ name: 'sa_notes', type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'sa_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'sa_updated_at' })
  updatedAt!: Date;
}

