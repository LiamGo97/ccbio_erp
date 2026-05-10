import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity({ name: 'tb_code' })
export class Code {
  @PrimaryGeneratedColumn({ type: 'int', name: 'cd_id' })
  id: number;

  @Column({ name: 'cd_group', length: 50 })
  group: string; // 코드 그룹 (PRODUCT_CATEGORY, PRODUCT, SHIPPING_LINE 등)

  @Column({ name: 'cd_name', length: 100 })
  name: string; // 표시명 (한글)

  @Column({ name: 'cd_value', length: 100, nullable: true })
  value?: string | null; // 실제 코드 값 (영문 등)

  @Column({ name: 'cd_order', type: 'int', default: 0 })
  order: number; // 정렬 순서

  @Column({ name: 'cd_parent_id', type: 'int', nullable: true })
  parentId?: number | null; // 계층 구조용

  @ManyToOne(() => Code, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cd_parent_id' })
  parent?: Code | null;

  @Column({ name: 'cd_aliases', type: 'text', nullable: true })
  aliases?: string | null; // AI 참조용 별칭 (쉼표로 구분)

  @CreateDateColumn({ name: 'cd_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'cd_updated_at' })
  updatedAt: Date;
}

