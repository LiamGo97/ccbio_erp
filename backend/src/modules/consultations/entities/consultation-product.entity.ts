import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Consultation } from './consultation.entity';
import { Code } from '../../codes/entities/code.entity';

@Entity({ name: 'tb_consultation_product' })
export class ConsultationProduct {
  @PrimaryGeneratedColumn({ type: 'int', name: 'cp_id' })
  id!: number;

  @ManyToOne(() => Consultation, (consultation) => consultation.products, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'co_id' })
  consultation!: Consultation;

  @Column({ name: 'co_id', type: 'bigint' })
  consultationId!: string;

  @ManyToOne(() => Code, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cp_product_category' })
  productCategory?: Code | null;

  @Column({ name: 'cp_product_category', type: 'int', nullable: true })
  productCategoryId?: number | null;

  @Column({ name: 'cp_product', length: 150, nullable: true })
  productName?: string | null;

  @Column({ name: 'cp_grade', length: 100, nullable: true })
  grade?: string | null;

  @Column({ name: 'cp_packing_type', length: 100, nullable: true })
  packingType?: string | null;

  @Column({ name: 'cp_requested_weight', length: 100, nullable: true })
  requestedWeight?: string | null;

  @Column({ name: 'cp_requested_vehicle', length: 100, nullable: true })
  requestedVehicle?: string | null;

  @Column({ name: 'cp_order', type: 'int', default: 0 })
  order!: number;

  @CreateDateColumn({ name: 'cp_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'cp_updated_at' })
  updatedAt!: Date;
}

