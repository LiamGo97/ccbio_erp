import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { City } from '../../cities/entities/city.entity';

@Entity({ name: 'tb_region' })
export class Region {
  @PrimaryGeneratedColumn({ type: 'int', name: 're_id' })
  id: number;

  @Column({ name: 're_name', length: 50, unique: true })
  name: string;

  @Column({ name: 're_code', length: 20, nullable: true })
  code?: string | null;

  @Column({ name: 're_order', default: 0 })
  order: number;

  @CreateDateColumn({ name: 're_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 're_updated_at' })
  updatedAt: Date;

  @OneToMany(() => City, (city) => city.region)
  cities?: City[];
}

