import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';

@Entity({ name: 'tb_customer_statement_name' })
export class CustomerStatementName {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'csn_id' })
  id!: string;

  @Column({ name: 'cu_id', type: 'bigint' })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer;

  @Column({ name: 'csn_company_name', length: 150, nullable: true })
  companyName?: string | null;

  @Column({ name: 'csn_display_name', length: 150 })
  displayName!: string;

  @Column({ name: 'csn_contact_phone', length: 50, nullable: true })
  contactPhone?: string | null;

  @Column({ name: 'csn_is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'csn_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'csn_updated_at' })
  updatedAt!: Date;
}
