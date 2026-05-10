import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SalesDelivery } from './sales-delivery.entity';
import { Warehouse } from '../../warehouse/entities/warehouse.entity';

/** 상차 업체가 입력한 작업 내용 (배송 단위, 컨테이너와 1:1 아님). 행 삭제해도 이력 유지. */
@Entity({ name: 'tb_sales_delivery_work_line' })
export class SalesDeliveryWorkLine {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'sdwl_id' })
  id!: string;

  @Column({ name: 'sdwl_sales_delivery_id', type: 'bigint' })
  salesDeliveryId!: string;

  @ManyToOne(() => SalesDelivery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sdwl_sales_delivery_id' })
  salesDelivery?: SalesDelivery;

  @Column({ name: 'sdwl_warehouse_id', type: 'int', nullable: true })
  warehouseId?: number | null;

  @ManyToOne(() => Warehouse, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sdwl_warehouse_id' })
  warehouse?: Warehouse | null;

  @Column({ name: 'sdwl_work_bl', length: 100, nullable: true })
  workBL?: string | null;

  @Column({ name: 'sdwl_work_container', length: 100, nullable: true })
  workContainer?: string | null;

  @Column({ name: 'sdwl_work_container_type', length: 20, nullable: true })
  workContainerType?: 'CONTAINER' | 'CARGO' | null;

  @Column({ name: 'sdwl_work_bales', type: 'decimal', precision: 14, scale: 4, nullable: true })
  workBales?: number | null;

  @Column({ name: 'sdwl_work_weight', type: 'decimal', precision: 14, scale: 4, nullable: true })
  workWeight?: number | null;

  @Column({ name: 'sdwl_notes', type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'sdwl_order', type: 'int', default: 1 })
  order!: number;

  @CreateDateColumn({ name: 'sdwl_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'sdwl_updated_at' })
  updatedAt!: Date;
}
