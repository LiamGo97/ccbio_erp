import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_dispatch_company' })
export class DispatchCompany {
  @PrimaryGeneratedColumn({ type: 'int', name: 'dc_id' })
  id: number;

  @Column({ name: 'dc_name', length: 100 })
  name: string;

  @Column({ name: 'dc_status', default: true })
  status: boolean;

  @CreateDateColumn({ name: 'dc_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'dc_updated_at' })
  updatedAt: Date;
}

