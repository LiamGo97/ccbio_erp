import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Region } from '../../regions/entities/region.entity';
import { City } from '../../cities/entities/city.entity';
import { Warehouse } from '../../warehouse/entities/warehouse.entity';
import { DispatchCompany } from '../../dispatch-company/entities/dispatch-company.entity';
import { UnloadingCompany } from '../../unloading-company/entities/unloading-company.entity';
import { User } from '../../users/entities/user.entity';
import { VehicleDispatchLoadingItem } from './vehicle-dispatch-loading-item.entity';
import { Sales } from '../../sales/entities/sales.entity';

@Entity({ name: 'tb_vehicle_dispatch' })
export class VehicleDispatch {
  @PrimaryGeneratedColumn({ type: 'int', name: 'vd_id' })
  id: number;

  @Column({ name: 'vd_request_vehicle', length: 50, nullable: true })
  requestVehicle?: string | null;

  @Column({ name: 'vd_request_weight', type: 'varchar', length: 50, nullable: true })
  requestWeight?: string | null;

  @Column({ name: 'vd_loading_warehouse_id', type: 'int', nullable: true })
  loadingWarehouseId?: number | null;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vd_loading_warehouse_id' })
  loadingWarehouse?: Warehouse | null;

  @Column({ name: 'vd_loading_schedule', type: 'date', nullable: true })
  loadingSchedule?: Date | null;

  @Column({ name: 'vd_loading_schedule_time', length: 50, nullable: true })
  loadingScheduleTime?: string | null;

  @Column({ name: 'vd_unloading_postal_code', length: 10, nullable: true })
  unloadingPostalCode?: string | null;

  @Column({ name: 'vd_unloading_address', type: 'text', nullable: true })
  unloadingAddress?: string | null;

  @Column({ name: 'vd_unloading_address_detail', type: 'text', nullable: true })
  unloadingAddressDetail?: string | null;

  @Column({ name: 'vd_unloading_region_id', type: 'int', nullable: true })
  unloadingRegionId?: number | null;

  @ManyToOne(() => Region, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vd_unloading_region_id' })
  unloadingRegion?: Region | null;

  @Column({ name: 'vd_unloading_city_id', type: 'int', nullable: true })
  unloadingCityId?: number | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vd_unloading_city_id' })
  unloadingCity?: City | null;

  @Column({ name: 'vd_unloading_schedule', type: 'timestamp', nullable: true })
  unloadingSchedule?: Date | null;

  @Column({ name: 'vd_unloading_schedule_date', type: 'date', nullable: true })
  unloadingScheduleDate?: Date | null;

  @Column({ name: 'vd_unloading_schedule_time', length: 50, nullable: true })
  unloadingScheduleTime?: string | null;

  @Column({ name: 'vd_freight_payment_type', length: 20, nullable: true })
  freightPaymentType?: string | null;

  @Column({ name: 'vd_company_name', length: 100, nullable: true })
  companyName?: string | null;

  @Column({ name: 'vd_representative_name', length: 100, nullable: true })
  representativeName?: string | null;

  @Column({ name: 'vd_phone', length: 50, nullable: true })
  phone?: string | null;

  @Column({ name: 'vd_request_bl', length: 100, nullable: true })
  requestBL?: string | null;

  @Column({ name: 'vd_request_container', length: 100, nullable: true })
  requestContainer?: string | null;

  @Column({ name: 'vd_order_number', length: 100, nullable: true })
  orderNumber?: string | null;

  @Column({ name: 'vd_work_bl', length: 100, nullable: true })
  workBL?: string | null;

  @Column({ name: 'vd_work_container', length: 100, nullable: true })
  workContainer?: string | null;

  @Column({ name: 'vd_notes', type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'vd_status', length: 20, default: 'DRAFT' })
  status?: 'DRAFT' | 'DISPATCH_COMPLETED' | 'ASSIGNED' | 'LOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED' | 'UNLOADING_COMPLETED';

  @Column({ name: 'vd_created_by', type: 'int', nullable: true })
  createdBy?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vd_created_by' })
  createdByUser?: User | null;

  @Column({ name: 'vd_assigned_to', type: 'int', nullable: true })
  assignedTo?: number | null;

  @Column({ name: 'dc_id', type: 'int', nullable: true })
  dispatchCompanyId?: number | null;

  @ManyToOne(() => DispatchCompany, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dc_id' })
  dispatchCompany?: DispatchCompany | null;

  @Column({ name: 'vd_completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date | null;

  @Column({ name: 'vd_vehicle_number', length: 50, nullable: true })
  vehicleNumber?: string | null;

  @Column({ name: 'vd_driver_contact', length: 50, nullable: true })
  driverContact?: string | null;

  @Column({ name: 'vd_driver_name', length: 50, nullable: true })
  driverName?: string | null;

  @Column({ name: 'vd_entry_time', length: 50, nullable: true })
  entryTime?: string | null;

  @Column({ name: 'vd_transport_fee', type: 'decimal', precision: 12, scale: 2, nullable: true })
  transportFee?: number | null;

  @Column({ name: 'vd_weighing_fee', type: 'decimal', precision: 12, scale: 2, nullable: true })
  weighingFee?: number | null;

  @Column({ name: 'vd_loading_date_time', length: 100, nullable: true })
  loadingDateTime?: string | null;

  @Column({ name: 'vd_unloading_date_time', length: 100, nullable: true })
  unloadingDateTime?: string | null;

  @Column({ name: 'vd_status_reason', type: 'text', nullable: true })
  statusReason?: string | null;

  @Column({ name: 'vd_unloading_company_id', type: 'int', nullable: true })
  unloadingCompanyId?: number | null;

  @ManyToOne(() => UnloadingCompany, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vd_unloading_company_id' })
  unloadingCompany?: UnloadingCompany | null;

  @Column({ name: 'vd_direct_unloading_contact', length: 50, nullable: true })
  directUnloadingContact?: string | null;

  @OneToMany(() => VehicleDispatchLoadingItem, (item) => item.vehicleDispatch, { cascade: true })
  loadingItems?: VehicleDispatchLoadingItem[];

  @Column({ name: 'vd_deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date | null;

  @Column({ name: 'vd_deleted_by', type: 'int', nullable: true })
  deletedBy?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vd_deleted_by' })
  deletedByUser?: User | null;

  @Column({ name: 'vd_has_failed', type: 'boolean', default: false, nullable: false })
  hasFailed?: boolean;

  @Column({ name: 'vd_has_rescheduled', type: 'boolean', default: false, nullable: false })
  hasRescheduled?: boolean;

  @Column({ name: 'vd_reprocess_reason', type: 'text', nullable: true })
  reprocessReason?: string | null;

  @Column({ name: 'vd_sales_id', type: 'bigint', nullable: true })
  salesId?: string | null;

  @ManyToOne(() => Sales, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vd_sales_id' })
  sales?: Sales | null;

  @CreateDateColumn({ name: 'vd_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'vd_updated_at' })
  updatedAt: Date;
}

