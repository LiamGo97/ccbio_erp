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

@Entity({ name: 'tb_customer_contact' })
export class CustomerContact {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'cct_id' })
  id!: string;

  @Column({ name: 'cu_id', type: 'bigint' })
  customerId!: string;

  @ManyToOne(() => Customer, (c) => c.contacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer;

  @Column({ name: 'cct_name', length: 100 })
  name!: string;

  @Column({ name: 'cct_phone', length: 50, nullable: true })
  phone?: string | null;

  @Column({ name: 'cct_relationship', length: 100, nullable: true })
  relationship?: string | null;

  @CreateDateColumn({ name: 'cct_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'cct_updated_at' })
  updatedAt!: Date;
}
