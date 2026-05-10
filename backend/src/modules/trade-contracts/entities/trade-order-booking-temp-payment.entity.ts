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

@Entity({ name: 'tb_trade_order_booking_temp_payment' })
@Unique(['order', 'sequence'])
export class TradeOrderBookingTempPayment {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'totp_id' })
  id!: string;

  @ManyToOne(() => TradeOrder, (o) => o.bookingTempPayments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_id' })
  order!: TradeOrder;

  @Column({ name: 'totp_sequence', type: 'smallint' })
  sequence!: number;

  @Column({ name: 'totp_due_date', type: 'date', nullable: true })
  dueDate?: Date | null;

  @Column({ name: 'totp_ratio', type: 'numeric', precision: 7, scale: 3, nullable: true })
  ratio?: string | null;

  @Column({ name: 'totp_amount', type: 'numeric', precision: 16, scale: 2, nullable: true })
  amount?: string | null;

  @Column({ name: 'totp_method', type: 'varchar', length: 20, nullable: true })
  method?: string | null;

  @Column({
    name: 'totp_exchange_rate',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  exchangeRate?: string | null;

  @Column({ name: 'totp_krw_amount', type: 'numeric', precision: 16, scale: 2, nullable: true })
  krwAmount?: string | null;

  @Column({ name: 'totp_result', type: 'text', nullable: true })
  result?: string | null;

  @Column({ name: 'totp_notes', type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'totp_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'totp_updated_at' })
  updatedAt!: Date;
}
