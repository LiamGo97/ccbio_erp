import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'tb_feature_audit_log' })
export class FeatureAuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'fal_id' })
  id: number;

  @Column({ name: 'fal_domain', length: 20 })
  domain: string; // TRADE | SALES | FINANCE

  @Column({ name: 'fal_feature', length: 50 })
  feature: string; // INBOUND_PENDING | INBOUND_CONFIRMED | SALES_MANAGEMENT 등

  @Column({ name: 'fal_action', length: 20 })
  action: string; // CREATED | UPDATED | DELETED

  @Column({ name: 'fal_user_id', type: 'int', nullable: true })
  userId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fal_user_id' })
  user?: User | null;

  @Column({ name: 'fal_created_at', type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'fal_summary', length: 500 })
  summary: string;

  @Column({ name: 'fal_entity_type', length: 50, nullable: true })
  entityType?: string | null;

  @Column({ name: 'fal_entity_id', type: 'int', nullable: true })
  entityId?: number | null;

  @Column({ name: 'fal_payload', type: 'jsonb', nullable: true })
  payload?: Record<string, unknown> | null;

  /** 변경 전/후 스냅샷 (tb_entity_change_history 통합용, 선택) */
  @Column({ name: 'fal_old_data', type: 'jsonb', nullable: true })
  oldData?: Record<string, unknown> | null;

  @Column({ name: 'fal_new_data', type: 'jsonb', nullable: true })
  newData?: Record<string, unknown> | null;

  @Column({ name: 'fal_changed_fields', type: 'jsonb', nullable: true })
  changedFields?: Record<string, { old: unknown; new: unknown }> | null;

  @Column({ name: 'fal_description', type: 'text', nullable: true })
  description?: string | null;
}
