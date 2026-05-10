import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'tb_inbound_default_setting' })
export class InboundDefaultSetting {
  @PrimaryGeneratedColumn({ type: 'int', name: 'ids_id' })
  id: number;

  @Column({
    name: 'ids_value_usd',
    type: 'decimal',
    precision: 12,
    scale: 4,
    transformer: {
      from: (v: unknown) => (v != null && v !== '' ? String(v) : '0'),
      to: (v: string | number) => String(v),
    },
  })
  valueUsd: string;

  @Column({
    name: 'ids_value_eur',
    type: 'decimal',
    precision: 12,
    scale: 4,
    transformer: {
      from: (v: unknown) => (v != null && v !== '' ? String(v) : '0'),
      to: (v: string | number) => String(v),
    },
  })
  valueEur: string;

  @CreateDateColumn({ name: 'ids_changed_at' })
  changedAt: Date;

  @Column({ name: 'ids_changed_by', type: 'int', nullable: true })
  changedById?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ids_changed_by' })
  changedBy?: User | null;
}
