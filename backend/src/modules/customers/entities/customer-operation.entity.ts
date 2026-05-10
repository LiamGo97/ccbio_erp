import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';

@Entity({ name: 'tb_customer_operation' })
export class CustomerOperation {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'co_id' })
  id!: string;

  @Column({ name: 'co_customer_id', type: 'bigint' })
  customerId!: string;

  @ManyToOne(() => Customer, (customer) => customer.operations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'co_customer_id' })
  customer?: Customer;

  @Column({ name: 'co_operation', length: 50 })
  operation!: string; // 'COMPANY' | 'BEEF' | 'DAIRY' | 'HORSE' | 'GOAT'

  @Column({ name: 'co_operation_sub', length: 50, nullable: true })
  operationSub?: string | null; // 'INTEGRATED' | 'BREEDING' | 'FATTENING' | 'RAISING' | 'MILKING' | 'DRY_MILKING' | null

  @Column({ name: 'co_herd_size', type: 'int', nullable: true })
  herdSize?: number | null;

  @CreateDateColumn({ name: 'co_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'co_updated_at' })
  updatedAt!: Date;
}

