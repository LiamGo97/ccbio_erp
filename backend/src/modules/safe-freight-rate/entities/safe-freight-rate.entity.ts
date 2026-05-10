import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Code } from '../../codes/entities/code.entity';

@Entity({ name: 'tb_safe_freight_rate' })
export class SafeFreightRate {
  @PrimaryGeneratedColumn({ type: 'int', name: 'sfr_id' })
  id: number;

  @Column({ name: 'sfr_effective_from', type: 'date' })
  effectiveFrom: Date;

  @Column({ name: 'sfr_effective_to', type: 'date', nullable: true })
  effectiveTo?: Date | null;

  @Column({ name: 'sfr_port_code_id', type: 'int', nullable: true })
  portCodeId?: number | null;

  @ManyToOne(() => Code, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sfr_port_code_id' })
  portCode?: Code | null;

  /** 지역(시·도) 텍스트 저장 */
  @Column({ name: 'sfr_region_name', length: 100 })
  regionName: string;

  /** 시군구(시·군·구) 텍스트 저장 */
  @Column({ name: 'sfr_city_name', length: 100 })
  cityName: string;

  /** 읍·면·동 텍스트 저장 */
  @Column({ name: 'sfr_town_name', length: 50 })
  townName: string;

  @Column({ name: 'sfr_distance_km', type: 'int', nullable: true })
  distanceKm?: number | null;

  @Column({
    name: 'sfr_container_size',
    type: 'varchar',
    length: 10,
    default: '40FT',
  })
  containerSize: '40FT';

  @Column({
    name: 'sfr_safe_transport_rate',
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  safeTransportRate: number;

  @CreateDateColumn({ name: 'sfr_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'sfr_updated_at' })
  updatedAt: Date;
}
