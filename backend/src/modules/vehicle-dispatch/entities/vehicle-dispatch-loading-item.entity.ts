import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VehicleDispatch } from './vehicle-dispatch.entity';
import { Warehouse } from '../../warehouse/entities/warehouse.entity';

@Entity({ name: 'tb_vehicle_dispatch_loading_item' })
export class VehicleDispatchLoadingItem {
  @PrimaryGeneratedColumn({ type: 'int', name: 'vdli_id' })
  id: number;

  @Column({ name: 'vd_id', type: 'int' })
  vehicleDispatchId: number;

  @ManyToOne(() => VehicleDispatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vd_id' })
  vehicleDispatch?: VehicleDispatch;

  @Column({ name: 'vdli_loading_warehouse_id', type: 'int', nullable: true })
  loadingWarehouseId?: number | null;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vdli_loading_warehouse_id' })
  loadingWarehouse?: Warehouse | null;

  @Column({ name: 'vdli_request_bl', length: 100, nullable: true })
  requestBL?: string | null;

  @Column({ name: 'vdli_request_container', length: 100, nullable: true })
  requestContainer?: string | null;

  @Column({ name: 'vdli_work_bl', length: 100, nullable: true })
  workBL?: string | null;

  @Column({ name: 'vdli_work_container', length: 100, nullable: true })
  workContainer?: string | null;

  @Column({ name: 'vdli_work_weight', length: 50, nullable: true })
  workWeight?: string | null;

  @Column({ name: 'vdli_status', length: 20, default: 'PENDING' })
  status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';

  @Column({ name: 'vdli_order', type: 'int', default: 1 })
  order?: number;

  @Column({ name: 'vdli_notes', type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'vdli_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'vdli_updated_at' })
  updatedAt: Date;
}

