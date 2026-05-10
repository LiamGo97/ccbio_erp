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
  import { SalesItem } from '../../sales/entities/sales-item.entity';
  
  @Entity({ name: 'tb_sales_delivery_loading_item' })
  export class SalesDeliveryLoadingItem {
    @PrimaryGeneratedColumn({ type: 'bigint', name: 'sdli_id' })
    id!: string;
  
    @Column({ name: 'sdli_sales_delivery_id', type: 'bigint' })
    salesDeliveryId!: string;
  
    @ManyToOne(() => SalesDelivery, (delivery) => delivery.loadingItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sdli_sales_delivery_id' })
    salesDelivery?: SalesDelivery;
  
    // 판매 항목 참조 (창고, BL, 컨테이너, 베일, 중량은 여기서 참조)
    @Column({ name: 'sdli_sales_item_id', type: 'bigint', nullable: false })
    salesItemId!: string;
  
    @ManyToOne(() => SalesItem, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sdli_sales_item_id' })
    salesItem?: SalesItem;
  
    @Column({ name: 'sdli_loading_schedule', type: 'date', nullable: true })
    loadingSchedule?: Date | null;
  
    @Column({ name: 'sdli_loading_schedule_time', length: 50, nullable: true })
    loadingScheduleTime?: string | null;

    // 요청 정보 (판매 시점의 요청 정보, 이력 관리용)
    @Column({ name: 'sdli_request_bl', length: 100, nullable: true })
    requestBL?: string | null;

    @Column({ name: 'sdli_request_container', length: 100, nullable: true })
    requestContainer?: string | null;

    @Column({ name: 'sdli_request_container_type', length: 20, nullable: true })
    requestContainerType?: 'CONTAINER' | 'CARGO' | null;

    @Column({ name: 'sdli_request_bales', type: 'decimal', precision: 14, scale: 4, nullable: true })
    requestBales?: number | null;

    @Column({ name: 'sdli_request_weight', type: 'decimal', precision: 14, scale: 4, nullable: true })
    requestWeight?: number | null;

    /** 요청 시 관리자가 작성하는 비고 */
    @Column({ name: 'sdli_request_notes', type: 'text', nullable: true })
    requestNotes?: string | null;

    // 작업 정보 (상차 업체가 입력하는 실제 작업 정보 → 비고는 work_line.sdwl_notes)
    @Column({ name: 'sdli_work_bl', length: 100, nullable: true })
    workBL?: string | null;
  
    @Column({ name: 'sdli_work_container', length: 100, nullable: true })
    workContainer?: string | null;
  
    @Column({ name: 'sdli_work_container_type', length: 20, nullable: true })
    workContainerType?: 'CONTAINER' | 'CARGO' | null;
  
    @Column({ name: 'sdli_work_weight', type: 'decimal', precision: 14, scale: 4, nullable: true })
    workWeight?: number | null;
  
    @Column({ name: 'sdli_work_bales', type: 'decimal', precision: 14, scale: 4, nullable: true })
    workBales?: number | null;

    // 실제 정보 (하차완료 확인 시 입력, 작업 정보와 별도 관리)
    @Column({ name: 'sdli_actual_bl', length: 100, nullable: true })
    actualBL?: string | null;

    @Column({ name: 'sdli_actual_container', length: 100, nullable: true })
    actualContainer?: string | null;

    @Column({ name: 'sdli_actual_container_type', length: 20, nullable: true })
    actualContainerType?: 'CONTAINER' | 'CARGO' | null;

    @Column({ name: 'sdli_actual_bales', type: 'decimal', precision: 14, scale: 4, nullable: true })
    actualBales?: number | null;

    @Column({ name: 'sdli_actual_weight', type: 'decimal', precision: 14, scale: 4, nullable: true })
    actualWeight?: number | null;

    // 상차 상태
    @Column({ name: 'sdli_status', length: 20, default: 'PENDING' })
    status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';
  
    // 순서
    @Column({ name: 'sdli_order', type: 'int', default: 1 })
    order?: number;
  
    @CreateDateColumn({ name: 'sdli_created_at' })
    createdAt!: Date;
  
    @UpdateDateColumn({ name: 'sdli_updated_at' })
    updatedAt!: Date;
  }
  
  