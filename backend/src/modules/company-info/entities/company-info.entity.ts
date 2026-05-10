import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_company_info' })
export class CompanyInfo {
  @PrimaryGeneratedColumn({ type: 'int', name: 'ci_id' })
  id: number;

  @Column({ name: 'ci_business_registration_number', length: 50 })
  businessRegistrationNumber: string;

  @Column({ name: 'ci_representative_name', length: 100 })
  representativeName: string;

  @Column({ name: 'ci_company_name', length: 150 })
  companyName: string;

  @Column({ name: 'ci_address', length: 255 })
  address: string;

  @Column({ name: 'ci_tel', length: 50 })
  tel: string;

  @CreateDateColumn({ name: 'ci_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'ci_updated_at' })
  updatedAt: Date;
}

