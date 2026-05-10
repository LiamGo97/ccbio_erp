import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinTable,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'tb_role' })
export class Role {
  @PrimaryGeneratedColumn({ type: 'int', name: 'ro_id' })
  id: number;

  @Column({ name: 'ro_name', unique: true })
  name: string;

  @Column({ name: 'ro_code', unique: true })
  code: string; // ROLE_SYSTEM, ROLE_ADMIN 등

  @Column({ name: 'ro_description', nullable: true })
  description: string;

  @Column({ name: 'ro_is_active', default: true })
  isActive: boolean;

  @ManyToMany(() => User, (user) => user.roles)
  @JoinTable({
    name: 'tb_user_role',
    joinColumn: { name: 'ur_role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'ur_user_id', referencedColumnName: 'id' },
  })
  users: User[];

  @CreateDateColumn({ name: 'ro_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'ro_updated_at' })
  updatedAt: Date;
}

