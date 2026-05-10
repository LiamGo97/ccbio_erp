import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_quotation_sheet_row' })
@Unique('uq_qsr_sheet_row', ['sheetId', 'rowIndex'])
export class QuotationSheetRow {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'qsr_id' })
  id!: string;

  @Column({ name: 'qsr_sheet_id', length: 64 })
  sheetId!: string;

  @Column({ name: 'qsr_row_index', type: 'int' })
  rowIndex!: number;

  @Column({ name: 'qsr_bl', length: 255, nullable: true })
  bl?: string | null;

  @Column({ name: 'qsr_eta', length: 64, nullable: true })
  eta?: string | null;

  @Column({ name: 'qsr_currency', length: 255, nullable: true })
  currency?: string | null;

  @Column({ name: 'qsr_unit_price', length: 100, nullable: true })
  unitPrice?: string | null;

  @Column({ name: 'qsr_export_country', length: 255, nullable: true })
  exportCountry?: string | null;

  @Column({ name: 'qsr_product', type: 'text', nullable: true })
  product?: string | null;

  @Column({ name: 'qsr_grade', length: 255, nullable: true })
  grade?: string | null;

  @Column({ name: 'qsr_packing', length: 255, nullable: true })
  packing?: string | null;

  @Column({ name: 'qsr_remarks', type: 'text', nullable: true })
  remarks?: string | null;

  @Column({ name: 'qsr_fx_calc', length: 100, nullable: true })
  fxCalc?: string | null;

  @Column({ name: 'qsr_cost', length: 100, nullable: true })
  cost?: string | null;

  @Column({ name: 'qsr_margin', length: 100, nullable: true })
  margin?: string | null;

  @Column({ name: 'qsr_selling_price', length: 100, nullable: true })
  sellingPrice?: string | null;

  @Column({ name: 'us_id', type: 'int', nullable: true })
  userId?: number | null;

  @CreateDateColumn({ name: 'qsr_created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'qsr_updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
