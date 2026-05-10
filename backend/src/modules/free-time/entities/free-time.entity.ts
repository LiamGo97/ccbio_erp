import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_free_time' })
@Unique(['exporterCode', 'shippingLineCode', 'type', 'baseDate'])
export class FreeTime {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'ft_id' })
  id!: string;

  @Column({ name: 'ft_exporter_code' })
  exporterCode!: string;

  @Column({ name: 'ft_shipping_line_code' })
  shippingLineCode!: string;

  @Column({ name: 'ft_type', length: 16 })
  type!: string;

  @Column({ name: 'ft_base_date', type: 'date' })
  baseDate!: string;

  @Column({ name: 'ft_value', nullable: true })
  value?: string | null;

  @CreateDateColumn({ name: 'ft_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'ft_updated_at' })
  updatedAt!: Date;
}



