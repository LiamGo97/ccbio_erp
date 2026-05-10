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
  import { Sales } from '../../sales/entities/sales.entity';
  import { Region } from '../../regions/entities/region.entity';
  import { City } from '../../cities/entities/city.entity';
  import { DispatchCompany } from '../../dispatch-company/entities/dispatch-company.entity';
  import { UnloadingCompany } from '../../unloading-company/entities/unloading-company.entity';
  import { User } from '../../users/entities/user.entity';
  import { SalesDeliveryLoadingItem } from './sales-delivery-loading-item.entity';
import { SalesDeliveryWorkLine } from './sales-delivery-work-line.entity';

  @Entity({ name: 'tb_sales_delivery' })
  export class SalesDelivery {
    @PrimaryGeneratedColumn({ type: 'bigint', name: 'sd_id' })
    id!: string;
  
    @Column({ name: 'sd_sales_id', type: 'bigint', unique: true })
    salesId!: string;
  
    @ManyToOne(() => Sales, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sd_sales_id' })
    sales?: Sales;
  
    @Column({ name: 'sd_status', length: 20, default: 'PENDING_DISPATCH' })
    status?: string;
  
    @Column({ name: 'sd_order_number', length: 50, nullable: true })
    orderNumber?: string | null;
  
    // 배송 기본 정보
    @Column({ name: 'sd_request_vehicle', length: 50, nullable: true })
    requestVehicle?: string | null;
  
    @Column({ name: 'sd_request_weight', length: 50, nullable: true })
    requestWeight?: string | null;
  
    // 하차지 정보
    @Column({ name: 'sd_unloading_postal_code', length: 10, nullable: true })
    unloadingPostalCode?: string | null;
  
    @Column({ name: 'sd_unloading_address', type: 'text', nullable: true })
    unloadingAddress?: string | null;
  
    @Column({ name: 'sd_unloading_address_detail', type: 'text', nullable: true })
    unloadingAddressDetail?: string | null;
  
    @Column({ name: 'sd_unloading_region_id', type: 'int', nullable: true })
    unloadingRegionId?: number | null;
  
    @ManyToOne(() => Region, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'sd_unloading_region_id' })
    unloadingRegion?: Region | null;
  
    @Column({ name: 'sd_unloading_city_id', type: 'int', nullable: true })
    unloadingCityId?: number | null;
  
    @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'sd_unloading_city_id' })
    unloadingCity?: City | null;
  
    @Column({ name: 'sd_unloading_schedule_date', type: 'date', nullable: true })
    unloadingScheduleDate?: Date | null;
  
    @Column({ name: 'sd_unloading_schedule_time', length: 50, nullable: true })
    unloadingScheduleTime?: string | null;
  
    // 배차 정보
    @Column({ name: 'sd_dispatch_company_id', type: 'int', nullable: true })
    dispatchCompanyId?: number | null;
  
    @ManyToOne(() => DispatchCompany, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'sd_dispatch_company_id' })
    dispatchCompany?: DispatchCompany | null;
  
    @Column({ name: 'sd_unloading_company_id', type: 'int', nullable: true })
    unloadingCompanyId?: number | null;
  
    @ManyToOne(() => UnloadingCompany, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'sd_unloading_company_id' })
    unloadingCompany?: UnloadingCompany | null;
  
    /** 직접 하차 선택 시 연락처 (unloadingCompanyId가 null일 때 사용) */
    @Column({ name: 'sd_direct_unloading_contact', length: 50, nullable: true })
    directUnloadingContact?: string | null;
  
    @Column({ name: 'sd_vehicle_number', length: 50, nullable: true })
    vehicleNumber?: string | null;
  
    @Column({ name: 'sd_driver_name', length: 50, nullable: true })
    driverName?: string | null;
  
    @Column({ name: 'sd_driver_contact', length: 50, nullable: true })
    driverContact?: string | null;
  
    @Column({ name: 'sd_entry_time', length: 50, nullable: true })
    entryTime?: string | null;
  
    @Column({ name: 'sd_loading_date_time', length: 100, nullable: true })
    loadingDateTime?: string | null;
  
    @Column({ name: 'sd_unloading_date_time', length: 100, nullable: true })
    unloadingDateTime?: string | null;
  
    // 비용 정보
    @Column({ name: 'sd_transport_fee', type: 'decimal', precision: 12, scale: 2, nullable: true })
    transportFee?: number | null;
  
    @Column({ name: 'sd_weighing_fee', type: 'decimal', precision: 12, scale: 2, nullable: true })
    weighingFee?: number | null;

    @Column({ name: 'sd_freight_payment_type', length: 20, nullable: true })
    freightPaymentType?: string | null;

    /** 운송비 지급 상태 (UNPAID/PAID, 운송비·계근비 통합) */
    @Column({ name: 'sd_transport_fee_payment_status', length: 20, nullable: true })
    transportFeePaymentStatus?: string | null;

    /** 하차완료 시 계근증 관련 텍스트 (상대편이 보낸 내용 등, 추후 확인용) */
    @Column({ name: 'sd_weighing_cert_info', type: 'text', nullable: true })
    weighingCertInfo?: string | null;

    /** 하차완료 시 계근증 이미지 경로 (GCS 버킷 내부 경로 JSON 배열) */
    @Column({ name: 'sd_weighing_cert_image_paths', type: 'text', nullable: true })
    weighingCertImagePaths?: string | null;
  
    // 메모
    @Column({ name: 'sd_notes', type: 'text', nullable: true })
    notes?: string | null;
  
    // 상태 관련
    @Column({ name: 'sd_status_reason', type: 'text', nullable: true })
    statusReason?: string | null;
  
    @Column({ name: 'sd_reprocess_reason', type: 'text', nullable: true })
    reprocessReason?: string | null;
  
    // 시스템 정보
    @Column({ name: 'sd_created_by', type: 'int', nullable: true })
    createdBy?: number | null;
  
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'sd_created_by' })
    createdByUser?: User | null;
  
    @Column({ name: 'sd_deleted_at', type: 'timestamp', nullable: true })
    deletedAt?: Date | null;
  
    @Column({ name: 'sd_deleted_by', type: 'int', nullable: true })
    deletedBy?: number | null;
  
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'sd_deleted_by' })
    deletedByUser?: User | null;
  
    @OneToMany(() => SalesDeliveryLoadingItem, (item) => item.salesDelivery, { cascade: true })
    loadingItems?: SalesDeliveryLoadingItem[];

    /** 상차 업체가 작성한 작업 라인 (BL/컨테이너/비고 등, 컨테이너 1:1 아님, 행 삭제해도 이력 유지) */
    @OneToMany(() => SalesDeliveryWorkLine, (wl) => wl.salesDelivery, { cascade: true })
    workLines?: SalesDeliveryWorkLine[];
  
    @CreateDateColumn({ name: 'sd_created_at' })
    createdAt!: Date;
  
    @UpdateDateColumn({ name: 'sd_updated_at' })
    updatedAt!: Date;
  }
  
  