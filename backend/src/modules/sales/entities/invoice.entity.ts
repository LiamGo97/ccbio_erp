import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { InvoiceItem } from './invoice-item.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { AccountsReceivable } from '../../receivables/entities/accounts-receivable.entity';
import { CustomerStatementName } from '../../customers/entities/customer-statement-name.entity';

@Entity({ name: 'tb_invoice' })
export class Invoice {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'iv_id' })
  id!: string;

  @Column({ name: 'iv_invoice_number', length: 50, nullable: true, unique: true })
  invoiceNumber?: string | null;

  @Column({ name: 'iv_status', length: 20, default: 'PENDING_ISSUE' })
  status?: 'PENDING_ISSUE' | 'ISSUED' | null;

  @Column({ name: 'iv_net_weight', type: 'decimal', precision: 12, scale: 4, nullable: true })
  netWeight?: number | null;

  @Column({ name: 'iv_invoice_amount', type: 'decimal', precision: 14, scale: 2, nullable: true })
  invoiceAmount?: number | null;

  @Column({ name: 'iv_subtotal', type: 'decimal', precision: 14, scale: 2, nullable: true })
  subtotal?: number | null;

  @Column({ name: 'iv_total_quantity', type: 'decimal', precision: 14, scale: 4, nullable: true })
  totalQuantity?: number | null;

  @Column({ name: 'iv_vat_amount', type: 'decimal', precision: 14, scale: 2, nullable: true })
  vatAmount?: number | null;

  @Column({ name: 'iv_vat_applied', type: 'boolean', default: false })
  vatApplied?: boolean;

  @Column({ name: 'iv_vat_rate', type: 'decimal', precision: 5, scale: 2, default: 10.0 })
  vatRate?: number;

  @Column({ name: 'cu_id', type: 'bigint', nullable: true })
  customerId?: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer | null;

  @Column({ name: 'iv_statement_name_id', type: 'bigint', nullable: true })
  statementNameId?: string | null;

  @ManyToOne(() => CustomerStatementName, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'iv_statement_name_id' })
  statementName?: CustomerStatementName | null;

  @Column({ name: 'iv_company_name', length: 150, nullable: true })
  companyName?: string | null;

  @Column({ name: 'iv_ceo', length: 100, nullable: true })
  ceo?: string | null;

  @Column({ name: 'iv_phone', length: 50, nullable: true })
  phone?: string | null;

  @Column({ name: 'iv_issued_at', type: 'timestamp', nullable: true })
  issuedAt?: Date | null;

  @Column({ name: 'iv_issued_by', type: 'int', nullable: true })
  issuedBy?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'iv_issued_by' })
  issuedByUser?: User | null;

  @Column({ name: 'iv_notes', type: 'text', nullable: true })
  notes?: string | null;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items?: InvoiceItem[];

  @Column({ name: 'iv_deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date | null;

  @Column({ name: 'iv_deleted_by', type: 'int', nullable: true })
  deletedBy?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'iv_deleted_by' })
  deletedByUser?: User | null;

  @Column({ name: 'iv_sms_not_applicable', type: 'boolean', default: false })
  smsNotApplicable?: boolean;

  @Column({ name: 'iv_sms_manager_id', type: 'int', nullable: true })
  smsManagerId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'iv_sms_manager_id' })
  smsManager?: User | null;

  @Column({ name: 'iv_ecount_processing_status', length: 20, default: 'NOT_PROCESSED' })
  ecountProcessingStatus?: string | null;

  @Column({ name: 'iv_ecount_processed_at', type: 'timestamp', nullable: true })
  ecountProcessedAt?: Date | null;

  @Column({ name: 'iv_ecount_processed_by', type: 'int', nullable: true })
  ecountProcessedBy?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'iv_ecount_processed_by' })
  ecountProcessedByUser?: User | null;

  @Column({ name: 'iv_supplier_id', type: 'int', nullable: true })
  supplierId?: number | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'iv_supplier_id' })
  supplier?: Supplier | null;

  @Column({ name: 'iv_previous_balance', type: 'decimal', precision: 14, scale: 2, nullable: true })
  previousBalance?: number | null;

  @Column({ name: 'iv_receivable_id', type: 'bigint', nullable: true })
  receivableId?: string | null;

  @ManyToOne(() => AccountsReceivable, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'iv_receivable_id' })
  receivable?: AccountsReceivable | null;

  @Column({ name: 'iv_attachment_image_url', type: 'text', nullable: true })
  attachmentImageUrl?: string | null;

  @Column({ name: 'iv_attachment_image_path', type: 'text', nullable: true })
  attachmentImagePath?: string | null;

  @CreateDateColumn({ name: 'iv_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'iv_updated_at' })
  updatedAt!: Date;
}

