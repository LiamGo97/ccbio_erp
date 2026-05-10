import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'tb_receivable_warning_config' })
@Unique(['warningLevel', 'userId'])
export class ReceivableWarningConfig {
  @PrimaryGeneratedColumn({ type: 'int', name: 'rwc_id' })
  id!: number;

  @Column({ name: 'rwc_warning_level', length: 20, nullable: false })
  warningLevel!: 'WARNING_1ST' | 'WARNING_2ND' | 'WARNING_3RD' | 'MALICIOUS';

  @Column({ name: 'rwc_user_id', type: 'int', nullable: true })
  @Index('idx_receivable_warning_config_user_id')
  userId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rwc_user_id' })
  user?: User | null;

  @Column({ name: 'rwc_days_threshold', type: 'int', nullable: false })
  daysThreshold!: number;

  @Column({ name: 'rwc_sms_enabled', type: 'boolean', default: true })
  smsEnabled!: boolean;

  @Column({ name: 'rwc_sms_daily', type: 'boolean', default: false })
  smsDaily!: boolean;

  @Column({ name: 'rwc_sms_template_type', length: 50, nullable: true })
  smsTemplateType?: string | null;

  @Column({ name: 'rwc_description', type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'rwc_order', type: 'int', nullable: false, default: 0 })
  order!: number;

  @Column({ name: 'rwc_is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'rwc_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'rwc_updated_at' })
  updatedAt!: Date;
}
