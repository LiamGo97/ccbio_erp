import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_supplier' })
export class Supplier {
  @PrimaryGeneratedColumn({ type: 'int', name: 'sp_id' })
  id: number;

  @Column({ name: 'sp_business_registration_number', length: 50 })
  businessRegistrationNumber: string;

  @Column({ name: 'sp_representative_name', length: 100 })
  representativeName: string;

  @Column({ name: 'sp_company_name', length: 150 })
  companyName: string;

  @Column({ name: 'sp_address', length: 255 })
  address: string;

  @Column({ name: 'sp_tel', length: 50 })
  tel: string;

  @Column({ name: 'sp_status', default: true })
  status: boolean;

  @CreateDateColumn({ name: 'sp_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'sp_updated_at' })
  updatedAt: Date;
}
