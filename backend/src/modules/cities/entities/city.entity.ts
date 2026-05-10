import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Region } from '../../regions/entities/region.entity';

@Entity({ name: 'tb_city' })
export class City {
  @PrimaryGeneratedColumn({ type: 'int', name: 'ci_id' })
  id: number;

  @Column({ name: 'ci_region_id', type: 'int' })
  regionId: number;

  @ManyToOne(() => Region, (region) => region.cities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ci_region_id' })
  region?: Region;

  @Column({ name: 'ci_name', length: 50 })
  name: string;

  @Column({ name: 'ci_code', length: 20, nullable: true })
  code?: string | null;

  @Column({ name: 'ci_order', default: 0 })
  order: number;

  @CreateDateColumn({ name: 'ci_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'ci_updated_at' })
  updatedAt: Date;
}

