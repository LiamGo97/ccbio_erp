import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DispatchCompany } from '../../dispatch-company/entities/dispatch-company.entity';

@Entity({ name: 'tb_dispatch_user' })
export class DispatchUser {
  @PrimaryGeneratedColumn({ type: 'int', name: 'du_id' })
  id: number;

  @Column({ name: 'du_user_id', type: 'int', unique: true })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'du_user_id' })
  user: User;

  @Column({ name: 'du_dispatch_company_id', type: 'int' })
  dispatchCompanyId: number;

  @ManyToOne(() => DispatchCompany, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'du_dispatch_company_id' })
  dispatchCompany: DispatchCompany;

  @Column({ name: 'du_name', length: 100 })
  name: string;

  @Column({ name: 'du_phone', length: 50, nullable: true })
  phone?: string | null;

  @Column({ name: 'du_position', length: 50, nullable: true })
  position?: string | null;

  @Column({ name: 'du_status', default: true })
  status: boolean;

  @CreateDateColumn({ name: 'du_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'du_updated_at' })
  updatedAt: Date;
}

