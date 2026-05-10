import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SmsSender } from '../../sms-sender/entities/sms-sender.entity';

export interface ReceivableSmsBatchResult {
  customerId: string;
  companyName: string | null;
  success: boolean;
  error?: string;
}

export interface ReceivableSmsBatchFilterParams {
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  excludeZeroBalance?: boolean;
  supplierIds?: number[];
}

@Entity({ name: 'tb_receivable_sms_batch' })
export class ReceivableSmsBatch {
  @PrimaryGeneratedColumn({ type: 'int', name: 'rsb_id' })
  id: number;

  @Column({ name: 'rsb_created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'rsb_created_by', type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'rsb_created_by', referencedColumnName: 'id' })
  createdBy?: User | null;

  @Column({ name: 'rsb_trigger', length: 20, default: 'MANUAL' })
  trigger: string;

  @Column({ name: 'rsb_sender_id', type: 'int' })
  senderId: number;

  @ManyToOne(() => SmsSender)
  @JoinColumn({ name: 'rsb_sender_id', referencedColumnName: 'id' })
  sender?: SmsSender;

  @Column({ name: 'rsb_filter_params', type: 'jsonb', nullable: true })
  filterParams: ReceivableSmsBatchFilterParams | null;

  @Column({ name: 'rsb_total_target', type: 'int' })
  totalTarget: number;

  @Column({ name: 'rsb_sent_count', type: 'int', default: 0 })
  sentCount: number;

  @Column({ name: 'rsb_fail_count', type: 'int', default: 0 })
  failCount: number;

  @Column({ name: 'rsb_results', type: 'jsonb', nullable: true })
  results: ReceivableSmsBatchResult[] | null;
}
