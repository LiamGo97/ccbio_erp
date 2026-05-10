import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_sms_sender' })
export class SmsSender {
  @PrimaryGeneratedColumn({ type: 'int', name: 'ss_id' })
  id: number;

  @Column({ name: 'ss_phone', length: 20, unique: true })
  phone: string;

  @Column({ name: 'ss_name', length: 100 })
  name: string;

  @Column({ name: 'ss_status', default: true })
  status: boolean;

  @Column({ name: 'ss_notes', type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'ss_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'ss_updated_at' })
  updatedAt: Date;
}
