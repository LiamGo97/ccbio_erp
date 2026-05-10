import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'tb_organic_certification' })
export class OrganicCertification {
  @PrimaryGeneratedColumn({ type: 'int', name: 'oc_id' })
  id: number;

  @Column({ name: 'oc_certification_agency', length: 100, nullable: true })
  @Index()
  certificationAgency?: string | null;

  @Column({ name: 'oc_certification_number', length: 50, nullable: true })
  @Index()
  certificationNumber?: string | null;

  @Column({ name: 'oc_main_product', length: 100, nullable: true })
  mainProduct?: string | null;

  @Column({ name: 'oc_certification_type', length: 50, nullable: true })
  @Index()
  certificationType?: string | null;

  @Column({ name: 'oc_company_name', length: 100, nullable: true })
  @Index()
  companyName?: string | null;

  @Column({ name: 'oc_producer', length: 100, nullable: true })
  @Index()
  producer?: string | null;

  @Column({ name: 'oc_phone', length: 50, nullable: true })
  @Index()
  phone?: string | null;

  @Column({ name: 'oc_farm_count', type: 'int', default: 1 })
  farmCount: number;

  @Column({ name: 'oc_address', length: 500, nullable: true })
  address?: string | null;

  @Column({ name: 'oc_certification_start_date', type: 'date', nullable: true })
  certificationStartDate?: Date | null;

  @Column({ name: 'oc_certification_end_date', type: 'date', nullable: true })
  certificationEndDate?: Date | null;

  @Index()
  @Column({ name: 'oc_cultivation_area_m2', type: 'decimal', precision: 15, scale: 2, nullable: true })
  cultivationAreaM2?: number | null;

  @Column({ name: 'oc_annual_production_target', type: 'decimal', precision: 15, scale: 2, nullable: true })
  annualProductionTarget?: number | null;

  @Column({ name: 'oc_livestock_count', type: 'int', nullable: true })
  livestockCount?: number | null;

  @Column({ name: 'oc_delivery_destination', length: 200, nullable: true })
  deliveryDestination?: string | null;

  @Column({ name: 'oc_detail_products', type: 'jsonb', nullable: true })
  detailProducts?: string[] | null;

  @CreateDateColumn({ name: 'oc_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'oc_updated_at' })
  updatedAt: Date;
}

