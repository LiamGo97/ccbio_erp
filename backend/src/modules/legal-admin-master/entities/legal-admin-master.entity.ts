import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tb_legal_admin_master' })
export class LegalAdminMaster {
  @PrimaryColumn({ name: 'lam_b_code', type: 'char', length: 10 })
  bCode!: string;

  @Column({ name: 'lam_sido_name', type: 'varchar', length: 50 })
  sidoName!: string;

  @Column({ name: 'lam_sigungu_name', type: 'varchar', length: 100, default: '' })
  sigunguName!: string;

  @Column({ name: 'lam_eupmyeondong_name', type: 'varchar', length: 100, default: '' })
  eupmyeondongName!: string;

  @Column({ name: 'lam_ri_name', type: 'varchar', length: 100, default: '' })
  riName!: string;

  @Column({ name: 'lam_sort_rank', type: 'int', nullable: true })
  sortRank?: number | null;

  @Column({ name: 'lam_created_date_src', type: 'date', nullable: true })
  createdDateSrc?: Date | null;

  @Column({ name: 'lam_deleted_date_src', type: 'date', nullable: true })
  deletedDateSrc?: Date | null;

  @Column({ name: 'lam_legacy_b_code', type: 'varchar', length: 10, nullable: true })
  legacyBCode?: string | null;

  @CreateDateColumn({ name: 'lam_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'lam_updated_at' })
  updatedAt!: Date;
}
