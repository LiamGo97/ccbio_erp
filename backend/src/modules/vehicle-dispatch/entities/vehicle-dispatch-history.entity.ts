import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type ChangeType = 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'DELETE';
export type EntityType = 'VEHICLE_DISPATCH' | 'SCHEDULE' | string; // 추후 확장 가능

@Entity({ name: 'tb_entity_change_history' })
@Index(['entityType', 'entityId'])
@Index(['entityType', 'changedAt'])
export class EntityChangeHistory {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'ech_id' })
  id: number;

  @Column({ name: 'ech_entity_type', length: 50 })
  entityType: EntityType;

  @Column({ name: 'ech_entity_id', type: 'int' })
  entityId: number;

  @Column({ name: 'ech_change_type', length: 20 })
  changeType: ChangeType;

  @Column({ name: 'ech_changed_fields', type: 'jsonb', nullable: true })
  changedFields?: Record<string, { old: any; new: any }> | null;

  @Column({ name: 'ech_old_data', type: 'jsonb', nullable: true })
  oldData?: Record<string, any> | null;

  @Column({ name: 'ech_new_data', type: 'jsonb', nullable: true })
  newData?: Record<string, any> | null;

  @Column({ name: 'ech_changed_by', type: 'int', nullable: true })
  changedBy?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ech_changed_by' })
  changedByUser?: User | null;

  @CreateDateColumn({ name: 'ech_changed_at', type: 'timestamptz' })
  changedAt: Date;

  @Column({ name: 'ech_description', type: 'text', nullable: true })
  description?: string | null;
}

