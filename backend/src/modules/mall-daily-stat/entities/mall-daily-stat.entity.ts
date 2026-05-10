import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'tb_mall_daily_stat' })
export class MallDailyStat {
  @PrimaryGeneratedColumn({ type: 'int', name: 'mds_id' })
  id: number;

  @Index('idx_mall_daily_stat_date')
  @Column({ name: 'mds_stat_date', type: 'date' })
  statDate: string; // YYYY-MM-DD

  @Column({ name: 'mds_total_visitors', type: 'int', default: 0 })
  totalVisitors: number;

  @Column({ name: 'mds_visits', type: 'int', default: 0 })
  visits: number;

  @Column({ name: 'mds_new_visitors', type: 'int', default: 0 })
  newVisitors: number;

  @Column({ name: 'mds_returning_visitors', type: 'int', default: 0 })
  returningVisitors: number;

  @Column({ name: 'mds_page_views', type: 'int', default: 0 })
  pageViews: number;

  @Column({ name: 'mds_app_installs', type: 'int', default: 0 })
  appInstalls: number;

  @Column({ name: 'mds_member_signups', type: 'int', default: 0 })
  memberSignups: number;

  @Column({ name: 'mds_sales_count', type: 'int', default: 0 })
  salesCount: number;

  @CreateDateColumn({ name: 'mds_created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'mds_updated_at' })
  updatedAt: Date;
}
