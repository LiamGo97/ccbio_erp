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
import { Sales } from './sales.entity';
import { SalesItem } from './sales-item.entity';

@Entity({ name: 'tb_customer_prepayment' })
export class CustomerPrepayment {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'cp_id' })
  id!: string;

  @Column({ name: 'cu_id', type: 'bigint', nullable: false })
  customerId!: string;

  @ManyToOne(() => Customer, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cu_id' })
  customer!: Customer;

  @Column({ name: 'sa_id', type: 'bigint', nullable: false })
  salesId!: string;

  @ManyToOne(() => Sales, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sa_id' })
  sales!: Sales;

  @Column({ name: 'si_id', type: 'bigint', nullable: true })
  salesItemId?: string | null;

  @ManyToOne(() => SalesItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'si_id' })
  salesItem?: SalesItem | null;

  @Column({ name: 'cp_prepayment_amount', type: 'numeric', precision: 16, scale: 2, nullable: false })
  prepaymentAmount!: string;

  @Column({ name: 'cp_actual_amount', type: 'numeric', precision: 16, scale: 2, nullable: true })
  actualAmount?: string | null;

  @Column({ name: 'cp_difference_amount', type: 'numeric', precision: 16, scale: 2, nullable: true })
  differenceAmount?: string | null;

  @Column({ name: 'cp_status', length: 20, nullable: false, default: 'REQUESTED' })
  status!: 'REQUESTED' | 'CONFIRMED' | 'AVAILABLE' | 'DEDUCTED' | 'REFUNDED' | 'CANCELLED'; // DEPRECATED: cp_payment_status와 cp_deduction_status 사용

  @Column({ name: 'cp_payment_status', length: 20, nullable: false, default: 'REQUESTED' })
  paymentStatus!: 'REQUESTED' | 'CONFIRMED' | 'AVAILABLE' | 'REFUNDED' | 'CANCELLED';

  @Column({ name: 'cp_deduction_status', length: 20, nullable: false, default: 'NOT_DEDUCTED' })
  deductionStatus!: 'NOT_DEDUCTED' | 'DEDUCTED';

  @Column({ name: 'cp_requested_date', type: 'date', nullable: true })
  requestedDate?: Date | null;

  @Column({ name: 'cp_confirmed_date', type: 'date', nullable: true })
  confirmedDate?: Date | null;

  @Column({ name: 'cp_deducted_date', type: 'date', nullable: true })
  deductedDate?: Date | null;

  @Column({ name: 'cp_payment_method', length: 50, nullable: true })
  paymentMethod?: string | null;

  @Column({ name: 'cp_payment_reference', length: 255, nullable: true })
  paymentReference?: string | null;

  @Column({ name: 'cp_notes', type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'cp_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'cp_updated_at' })
  updatedAt!: Date;
}
