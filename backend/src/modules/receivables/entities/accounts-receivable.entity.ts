import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity({ name: 'tb_accounts_receivable' })
export class AccountsReceivable {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'ar_id' })
  id!: string;

  @Column({ name: 'cu_id', type: 'bigint', unique: true })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer | null;

  @Column({ name: 'ar_total_sales', type: 'decimal', precision: 16, scale: 2, default: 0 })
  totalSales!: string;

  @Column({ name: 'ar_total_collected', type: 'decimal', precision: 16, scale: 2, default: 0 })
  totalCollected!: string;

  @Column({ name: 'ar_balance', type: 'decimal', precision: 16, scale: 2 })
  balance!: string;

  @Column({ name: 'ar_status', length: 20, default: 'OUTSTANDING' })
  status!: string;

  @Column({ name: 'ar_warning_status', length: 20, nullable: true })
  warningStatus?: string | null;

  @Column({ name: 'ar_occurred_date', type: 'date' })
  occurredDate!: Date;

  @Column({ name: 'ar_notes', type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'ar_payment_terms_type', length: 20, default: 'DAYS' })
  paymentTermsType?: 'DAYS' | 'THIS_MONTH_DAY' | 'NEXT_MONTH_DAY' | 'THIS_MONTH_END' | 'NEXT_MONTH_END';

  @Column({ name: 'ar_payment_terms_value', type: 'int', nullable: true })
  paymentTermsValue?: number | null;

  @Column({ name: 'ar_last_payment_due_date', type: 'date', nullable: true })
  lastPaymentDueDate?: Date | null;

  @Column({ name: 'ar_supplier_id', type: 'int', nullable: true })
  supplierId?: number | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ar_supplier_id' })
  supplier?: Supplier | null;

  @CreateDateColumn({ name: 'ar_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'ar_updated_at' })
  updatedAt!: Date;
}
