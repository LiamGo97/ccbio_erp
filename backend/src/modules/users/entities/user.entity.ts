import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity';

@Entity({ name: 'tb_user' })
export class User {
  @PrimaryGeneratedColumn({ type: 'int', name: 'us_id' })
  id: number;

  @Column({ name: 'us_email', unique: true })
  email: string;

  @Column({ name: 'us_name', nullable: true })
  name: string;

  @Column({ name: 'us_phone', length: 50, nullable: true })
  phone?: string | null;

  @Column({ name: 'us_picture', nullable: true })
  picture: string;

  @Column({ name: 'us_google_id', nullable: true })
  googleId: string;

  @Column({ name: 'us_google_access_token', type: 'text', nullable: true, select: false })
  googleAccessToken: string;

  @Column({ name: 'us_google_refresh_token', type: 'text', nullable: true, select: false })
  googleRefreshToken: string;

  @Column({ name: 'us_password', nullable: true, select: false })
  password: string;

  @Column({ name: 'us_is_active', default: true })
  isActive: boolean;

  @Column({ name: 'us_warehouse_id', type: 'int', nullable: true })
  warehouseId?: number | null;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({
    name: 'tb_user_role',
    joinColumn: { name: 'ur_user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'ur_role_id', referencedColumnName: 'id' },
  })
  roles: Role[];

  @CreateDateColumn({ name: 'us_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'us_updated_at' })
  updatedAt: Date;
}

