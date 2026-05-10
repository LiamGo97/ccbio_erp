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

@Entity({ name: 'tb_customer_delivery_address' })
export class CustomerDeliveryAddress {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'cda_id' })
  id!: string;

  @Column({ name: 'cu_id', type: 'bigint' })
  customerId!: string;

  @ManyToOne(() => Customer, (c) => c.deliveryAddresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer;

  @Column({ name: 'cda_label', length: 50, nullable: true })
  label?: string | null;

  @Column({ name: 'cda_recipient_name', length: 100, nullable: true })
  recipientName?: string | null;

  @Column({ name: 'cda_recipient_phone', length: 50, nullable: true })
  recipientPhone?: string | null;

  @Column({ name: 'cda_postal_code', length: 10, nullable: true })
  postalCode?: string | null;

  @Column({ name: 'cda_address_road', length: 500, nullable: true })
  addressRoad?: string | null;

  @Column({ name: 'cda_address_jibun', length: 500, nullable: true })
  addressJibun?: string | null;

  @Column({ name: 'cda_address_default_type', length: 50, default: 'ROAD' })
  addressDefaultType!: string;

  @Column({ name: 'cda_address_detail', length: 255, nullable: true })
  addressDetail?: string | null;

  @Column({ name: 'cda_legal_b_code', type: 'char', length: 10, nullable: true })
  legalBCode?: string | null;

  @Column({ name: 'cda_is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'cda_is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'cda_mall_delivery_address_id', type: 'bigint', nullable: true })
  mallDeliveryAddressId?: string | null;

  @CreateDateColumn({ name: 'cda_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'cda_updated_at' })
  updatedAt!: Date;
}
