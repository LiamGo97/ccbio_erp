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

@Entity({ name: 'tb_trade_order_payment' })
@Unique(['order', 'sequence'])
export class TradeOrderPayment {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'top_id' })
  id!: string;

  @ManyToOne(() => TradeOrder, (order) => order.payments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'to_id' })
  order!: TradeOrder;

  @Column({ name: 'top_sequence', type: 'int' })
  sequence!: number;

  @Column({ name: 'top_due_date', type: 'date', nullable: true })
  dueDate?: Date | null;

  @Column({ name: 'top_ratio', type: 'numeric', precision: 7, scale: 3, nullable: true })
  ratio?: string | null;

  @Column({ name: 'top_amount', type: 'numeric', precision: 16, scale: 2, nullable: true })
  amount?: string | null;

  @Column({ name: 'top_method', type: 'varchar', length: 20, nullable: true })
  method?: string | null;

  @Column({
    name: 'top_exchange_rate',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  exchangeRate?: string | null;

  @Column({ name: 'top_krw_amount', type: 'numeric', precision: 16, scale: 2, nullable: true })
  krwAmount?: string | null;

  @Column({ name: 'top_result', type: 'text', nullable: true })
  result?: string | null;

  @Column({ name: 'top_payment_type', length: 50, nullable: true })
  paymentType?: string | null; // PAYMENT_TYPE 코드 값 (REGULAR, DO_COST, CUSTOMS_COST)

  @Column({ name: 'top_notes', type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'top_use_ratio', type: 'boolean', nullable: true, default: true })
  useRatio?: boolean | null; // 비율 사용 여부 (기본값: true)

  @CreateDateColumn({ name: 'top_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'top_updated_at' })
  updatedAt!: Date;
}

