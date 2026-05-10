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
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity({ name: 'tb_sms_template' })
export class SmsTemplate {
  @PrimaryGeneratedColumn({ type: 'int', name: 'st_id' })
  id: number;

  @Column({ name: 'st_type', length: 50 })
  type: string; // 템플릿 타입 코드 값 (tb_code.cd_value 참조, 그룹: SMS_TEMPLATE_TYPE)

  @Column({ name: 'st_name', length: 100 })
  name: string; // 템플릿 이름

  @Column({ name: 'st_content', type: 'text' })
  content: string; // 템플릿 내용 (토큰 포함)

  @Column({ name: 'st_available_tokens', type: 'jsonb', nullable: true })
  availableTokens?: Array<{ token: string; description: string }> | null; // 사용 가능한 토큰 목록

  @Column({ name: 'st_supplier_id', type: 'int', nullable: true })
  supplierId?: number | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'st_supplier_id' })
  supplier?: Supplier | null;

  @Column({ name: 'st_sender', length: 20, nullable: true })
  sender?: string | null; // 발신번호 (템플릿별 발신번호 설정)

  @CreateDateColumn({ name: 'st_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'st_updated_at' })
  updatedAt: Date;

  @Column({ name: 'st_created_by', type: 'int', nullable: true })
  createdById?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'st_created_by' })
  createdBy?: User | null;

  @Column({ name: 'st_updated_by', type: 'int', nullable: true })
  updatedById?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'st_updated_by' })
  updatedBy?: User | null;
}
