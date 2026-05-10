import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_file' })
export class FileEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'fl_id' })
  id!: string;

  @Column({ name: 'fl_module', length: 30 })
  module!: string;

  @Column({ name: 'fl_type', length: 30, nullable: true })
  type?: string | null;

  @Column({ name: 'fl_ref_id', type: 'bigint', nullable: true })
  refId?: string | null;

  @Column({ name: 'fl_path', length: 255 })
  path!: string;

  @Column({ name: 'fl_original_name', length: 255, nullable: true })
  originalName?: string | null;

  @Column({ name: 'fl_content_type', length: 100, nullable: true })
  contentType?: string | null;

  @Column({ name: 'fl_size', type: 'bigint', nullable: true })
  size?: string | null;

  @Column({ name: 'fl_metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'fl_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'fl_updated_at' })
  updatedAt!: Date;
}


