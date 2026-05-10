import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SalesReservationSheetRowLogAction = 'INSERT' | 'UPDATE' | 'DELETE';

@Entity({ name: 'tb_sales_reservation_sheet_row_log' })
export class SalesReservationSheetRowLog {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'srsrl_id' })
  id!: string;

  @Column({ name: 'srsrl_sheet_id', length: 64 })
  sheetId!: string;

  @Column({ name: 'srsrl_row_index', type: 'int' })
  rowIndex!: number;

  @Column({ name: 'srsrl_action', length: 20 })
  action!: SalesReservationSheetRowLogAction;

  @Column({ name: 'us_id', type: 'int', nullable: true })
  userId?: number | null;

  @Column({ name: 'srsrl_before', type: 'jsonb', nullable: true })
  before?: Record<string, unknown> | null;

  @Column({ name: 'srsrl_after', type: 'jsonb', nullable: true })
  after?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'srsrl_created_at', type: 'timestamptz' })
  createdAt!: Date;
}
