import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_sales_reservation_sheet_row' })
@Unique('uq_srsr_sheet_row', ['sheetId', 'rowIndex'])
export class SalesReservationSheetRow {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'srsr_id' })
  id!: string;

  @Column({ name: 'srsr_sheet_id', length: 64 })
  sheetId!: string;

  @Column({ name: 'srsr_row_index', type: 'int' })
  rowIndex!: number;

  @Column({ name: 'srsr_product_code', length: 64, nullable: true })
  productCode?: string | null;

  @Column({ name: 'srsr_sales_grade', length: 64, nullable: true })
  salesGrade?: string | null;

  @Column({ name: 'srsr_bl', length: 128, nullable: true })
  bl?: string | null;

  @Column({ name: 'srsr_company_name', length: 255, nullable: true })
  companyName?: string | null;

  @Column({ name: 'srsr_contact', length: 100, nullable: true })
  contact?: string | null;

  @Column({ name: 'srsr_requested_qty', length: 100, nullable: true })
  requestedQty?: string | null;

  @Column({ name: 'srsr_vehicle_code', length: 64, nullable: true })
  vehicleCode?: string | null;

  @Column({ name: 'srsr_loading_schedule', type: 'text', nullable: true })
  loadingSchedule?: string | null;

  @Column({ name: 'srsr_arrival_schedule', type: 'text', nullable: true })
  arrivalSchedule?: string | null;

  @Column({ name: 'srsr_remarks', type: 'text', nullable: true })
  remarks?: string | null;

  @Column({
    name: 'srsr_unit_price',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  unitPrice?: string | null;

  @Column({ name: 'srsr_reference', type: 'text', nullable: true })
  reference?: string | null;

  @Column({ name: 'srsr_status', length: 100, nullable: true })
  status?: string | null;

  @Column({ name: 'us_id', type: 'int', nullable: true })
  userId?: number | null;

  @CreateDateColumn({ name: 'srsr_created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'srsr_updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
