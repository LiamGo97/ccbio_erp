import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { SalesItem } from './sales-item.entity';

@Entity({ name: 'tb_invoice_item' })
export class InvoiceItem {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'ivi_id' })
  id!: string;

  @Column({ name: 'iv_id', type: 'bigint', nullable: false })
  invoiceId!: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'iv_id' })
  invoice?: Invoice;

  @Column({ name: 'ivi_order', type: 'int', default: 1 })
  order?: number;

  @Column({ name: 'si_id', type: 'bigint', nullable: true })
  salesItemId?: string | null;

  @ManyToOne(() => SalesItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'si_id' })
  salesItem?: SalesItem | null;

  @Column({ name: 'ivi_product_name', length: 200, nullable: true })
  productName?: string | null;

  @Column({ name: 'ivi_quantity', type: 'decimal', precision: 12, scale: 4, nullable: true })
  quantity?: number | null;

  @Column({ name: 'ivi_unit', length: 50, nullable: true })
  unit?: string | null;

  @Column({ name: 'ivi_unit_price', type: 'decimal', precision: 14, scale: 2, nullable: true })
  unitPrice?: number | null;

  @Column({ name: 'ivi_amount', type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount?: number | null;

  @Column({ name: 'ivi_vat_amount', type: 'decimal', precision: 14, scale: 2, nullable: true })
  vatAmount?: number | null;

  @Column({ name: 'ivi_weight', type: 'decimal', precision: 12, scale: 4, nullable: true })
  weight?: number | null;

  @Column({ name: 'ivi_notes', length: 500, nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'ivi_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'ivi_updated_at' })
  updatedAt!: Date;
}

