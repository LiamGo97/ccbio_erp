import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AccountsReceivable } from './accounts-receivable.entity';
import { Customer } from '../../customers/entities/customer.entity';

@Entity({ name: 'tb_receivable_collection' })
export class ReceivableCollection {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'rc_id' })
  id!: string;

  @Column({ name: 'rc_collection_number', length: 50, nullable: true })
  collectionNumber?: string | null;

  @Column({ name: 'ar_id', type: 'bigint' })
  receivableId!: string;

  @ManyToOne(() => AccountsReceivable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ar_id' })
  receivable?: AccountsReceivable;

  @Column({ name: 'cu_id', type: 'bigint', nullable: true })
  customerId?: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer | null;

  @Column({ name: 'rc_collection_amount', type: 'decimal', precision: 16, scale: 2 })
  collectionAmount!: string;

  @Column({ name: 'rc_collection_date', type: 'date' })
  collectionDate!: Date;

  @Column({ name: 'rc_collection_method', length: 50, nullable: true })
  collectionMethod?: string | null;

  @Column({ name: 'rc_notes', type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'rc_is_prepayment', type: 'boolean', default: false })
  isPrepayment!: boolean;

  @CreateDateColumn({ name: 'rc_created_at' })
  createdAt!: Date;
}
