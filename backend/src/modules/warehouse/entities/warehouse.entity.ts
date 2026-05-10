import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { WarehouseIgobi } from '../../warehouse-igobi/entities/warehouse-igobi.entity';

@Entity({ name: 'tb_warehouse' })
export class Warehouse {
  @PrimaryGeneratedColumn({ type: 'int', name: 'wh_id' })
  id: number;

  @Column({ name: 'wh_name', length: 100 })
  name: string;

  // 실제 창고 주소 (카카오 주소 API)
  @Column({ name: 'wh_postal_code', length: 10, nullable: true })
  postalCode?: string | null;

  @Column({ name: 'wh_address', type: 'text', nullable: true })
  address?: string | null;

  @Column({ name: 'wh_address_detail', type: 'text', nullable: true })
  addressDetail?: string | null;

  // 계근대 주소 (카카오 주소 API)
  @Column({ name: 'wh_use_internal_gyegeundae', default: false })
  useInternalGyegeundae: boolean;

  @Column({ name: 'wh_gyegeundae_postal_code', length: 10, nullable: true })
  gyegeundaePostalCode?: string | null;

  @Column({ name: 'wh_gyegeundae_address', type: 'text', nullable: true })
  gyegeundaeAddress?: string | null;

  @Column({ name: 'wh_gyegeundae_address_detail', type: 'text', nullable: true })
  gyegeundaeAddressDetail?: string | null;

  @Column({ name: 'wh_phone', length: 50, nullable: true })
  phone?: string | null;

  @Column({ name: 'wh_manager_name', length: 100, nullable: true })
  managerName?: string | null;

  @Column({ name: 'wh_manager_phone', length: 50, nullable: true })
  managerPhone?: string | null;

  @Column({ name: 'wh_notes', type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'wh_status', default: true })
  status: boolean;

  @OneToMany(() => WarehouseIgobi, (igobi) => igobi.warehouse)
  igobis?: WarehouseIgobi[];

  @CreateDateColumn({ name: 'wh_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'wh_updated_at' })
  updatedAt: Date;
}

