import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Warehouse } from '../../warehouse/entities/warehouse.entity';

@Entity({ name: 'tb_warehouse_igobi' })
@Unique(['warehouseId', 'baseDate'])
export class WarehouseIgobi {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'wi_id' })
  id!: string;

  @Column({ name: 'wi_warehouse_id', type: 'int' })
  warehouseId!: number;

  @ManyToOne(() => Warehouse, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wi_warehouse_id', referencedColumnName: 'id' })
  warehouse?: Warehouse;

  @Column({ name: 'wi_base_date', type: 'date' })
  baseDate!: string;

  @Column({ name: 'wi_igobi', type: 'numeric', precision: 12, scale: 2 })
  igobi!: number;

  @CreateDateColumn({ name: 'wi_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'wi_updated_at' })
  updatedAt!: Date;
}

