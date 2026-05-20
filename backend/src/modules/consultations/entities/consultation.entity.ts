import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { Region } from '../../regions/entities/region.entity';
import { City } from '../../cities/entities/city.entity';
import { ConsultationProduct } from './consultation-product.entity';

@Entity({ name: 'tb_consultation' })
export class Consultation {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'co_id' })
  id!: string;

  @ManyToOne(() => Customer, (customer) => customer.consultations, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'cu_id' })
  customer?: Customer | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'us_id' })
  manager?: User | null;

  /** 답변 진행상태 — tb_code CONSULTATION_REPLY_STATUS 의 cd_value */
  @Column({ name: 'co_reply_status', length: 100, nullable: true })
  replyStatus?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'co_reply_assignee_us_id' })
  replyAssignee?: User | null;

  @Column({ name: 'co_consultation_date', type: 'date', nullable: true })
  consultationDate?: Date | null;

  @Column({ name: 'co_started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'co_ended_at', type: 'timestamptz', nullable: true })
  endedAt?: Date | null;

  @Column({ name: 'co_type', length: 50, nullable: true })
  type?: string | null;

  @Column({ name: 'co_source', length: 50, nullable: true })
  source?: string | null;

  @Column({ name: 'co_in_out', length: 10, nullable: true })
  inOut?: string | null;

  @Column({ name: 'co_product_name', length: 150, nullable: true })
  productName?: string | null;

  @Column({ name: 'co_grade', length: 100, nullable: true })
  grade?: string | null;

  @Column({ name: 'co_requested_weight', length: 100, nullable: true })
  requestedWeight?: string | null;

  @Column({ name: 'co_delivery_region', length: 100, nullable: true })
  deliveryRegion?: string | null; // 기존 호환성을 위해 유지

  @Column({ name: 'co_delivery_region_id', type: 'int', nullable: true })
  deliveryRegionId?: number | null;

  @ManyToOne(() => Region, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'co_delivery_region_id' })
  deliveryRegionEntity?: Region | null;

  @Column({ name: 'co_delivery_postal_code', length: 10, nullable: true })
  deliveryPostalCode?: string | null;

  @Column({ name: 'co_delivery_address', length: 255, nullable: true })
  deliveryAddress?: string | null;

  @Column({ name: 'co_delivery_address_detail', length: 255, nullable: true })
  deliveryAddressDetail?: string | null;

  @Column({ name: 'co_delivery_city', length: 50, nullable: true })
  deliveryCity?: string | null; // 기존 호환성을 위해 유지

  @Column({ name: 'co_delivery_city_id', type: 'int', nullable: true })
  deliveryCityId?: number | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'co_delivery_city_id' })
  deliveryCityEntity?: City | null;

  @Column({ name: 'co_proposed_price', length: 100, nullable: true })
  proposedPrice?: string | null;

  @Column({ name: 'co_has_unloading', type: 'boolean', default: false })
  hasUnloading!: boolean;

  @Column({ name: 'co_has_handling', type: 'boolean', default: false })
  hasHandling!: boolean;

  @Column({ name: 'co_notes', type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'co_main_product', length: 150, nullable: true })
  mainProduct?: string | null;

  @Column({ name: 'co_arrival_price', length: 100, nullable: true })
  arrivalPrice?: string | null;

  @OneToMany(() => ConsultationProduct, (product) => product.consultation, {
    cascade: true,
    eager: false,
  })
  products?: ConsultationProduct[];

  @CreateDateColumn({ name: 'co_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'co_updated_at' })
  updatedAt!: Date;
}

