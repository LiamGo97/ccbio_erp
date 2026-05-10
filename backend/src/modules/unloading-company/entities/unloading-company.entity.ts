import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_unloading_company' })
export class UnloadingCompany {
  @PrimaryGeneratedColumn({ type: 'int', name: 'uc_id' })
  id: number;

  @Column({ name: 'uc_representative_name', length: 100 })
  representativeName: string;

  @Column({ name: 'uc_contact', length: 50 })
  contact: string;

  @Column({ name: 'uc_notes', type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'uc_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'uc_updated_at' })
  updatedAt: Date;
}

