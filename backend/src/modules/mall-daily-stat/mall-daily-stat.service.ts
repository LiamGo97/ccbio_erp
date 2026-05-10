import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MallDailyStat } from './entities/mall-daily-stat.entity';
import { CreateMallDailyStatDto } from './dto/create-mall-daily-stat.dto';
import { UpdateMallDailyStatDto } from './dto/update-mall-daily-stat.dto';
import { GetMallDailyStatsDto } from './dto/get-mall-daily-stats.dto';

export interface WeekSummary {
  startDate: string;
  endDate: string;
  totalVisitors: number;
  visits: number;
  newVisitors: number;
  returningVisitors: number;
  pageViews: number;
  appInstalls: number;
  memberSignups: number;
  salesCount: number;
}

export interface DashboardResponse {
  daily: MallDailyStat[];
  lastWeek: WeekSummary | null;
  thisWeek: WeekSummary | null;
  cumulative: {
    totalMemberSignups: number;
    totalAppInstalls: number;
    totalSalesCount: number;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(ymd: string, days: number): string {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

// 주의 월요일 00:00 KST 기준으로 해당 주 start/end 반환
function getWeekBounds(date: Date): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: toYMD(mon), end: toYMD(sun) };
}

@Injectable()
export class MallDailyStatService {
  constructor(
    @InjectRepository(MallDailyStat)
    private readonly repo: Repository<MallDailyStat>,
  ) {}

  async getDashboard(startDate?: string, endDate?: string): Promise<DashboardResponse> {
    let thisWeek: { start: string; end: string };
    let lastWeek: { start: string; end: string };

    if (startDate && endDate && startDate <= endDate) {
      thisWeek = { start: startDate, end: endDate };
      const start = parseYMD(startDate);
      const end = parseYMD(endDate);
      const periodDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      lastWeek = {
        start: addDays(startDate, -periodDays),
        end: addDays(startDate, -1),
      };
    } else {
      const now = new Date();
      thisWeek = getWeekBounds(now);
      const lastMon = new Date(parseYMD(thisWeek.start));
      lastMon.setDate(lastMon.getDate() - 7);
      lastWeek = getWeekBounds(lastMon);
    }

    const fetchStart = lastWeek.start;
    const fetchEnd = thisWeek.end;

    const daily = await this.repo.find({
      where: {
        statDate: Between(fetchStart, fetchEnd),
      },
      order: { statDate: 'ASC' },
    });

    const aggregate = (rows: MallDailyStat[]): WeekSummary | null => {
      if (rows.length === 0) return null;
      return {
        startDate: rows[0].statDate,
        endDate: rows[rows.length - 1].statDate,
        totalVisitors: rows.reduce((s, r) => s + r.totalVisitors, 0),
        visits: rows.reduce((s, r) => s + r.visits, 0),
        newVisitors: rows.reduce((s, r) => s + r.newVisitors, 0),
        returningVisitors: rows.reduce((s, r) => s + r.returningVisitors, 0),
        pageViews: rows.reduce((s, r) => s + r.pageViews, 0),
        appInstalls: rows.reduce((s, r) => s + r.appInstalls, 0),
        memberSignups: rows.reduce((s, r) => s + r.memberSignups, 0),
        salesCount: rows.reduce((s, r) => s + r.salesCount, 0),
      };
    };

    const lastWeekRows = daily.filter(
      (r) => r.statDate >= lastWeek.start && r.statDate <= lastWeek.end,
    );
    const thisWeekRows = daily.filter(
      (r) => r.statDate >= thisWeek.start && r.statDate <= thisWeek.end,
    );

    const allRows = await this.repo.find({ order: { statDate: 'ASC' } });
    const cumulative = {
      totalMemberSignups: allRows.reduce((s, r) => s + r.memberSignups, 0),
      totalAppInstalls: allRows.reduce((s, r) => s + r.appInstalls, 0),
      totalSalesCount: allRows.reduce((s, r) => s + r.salesCount, 0),
    };

    return {
      daily,
      lastWeek: aggregate(lastWeekRows),
      thisWeek: aggregate(thisWeekRows),
      cumulative,
    };
  }

  async findAll(dto: GetMallDailyStatsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 31;
    const skip = (page - 1) * limit;
    const sortBy = dto.sortBy ?? 'statDate';
    const sortOrder = (dto.sortOrder ?? 'desc').toUpperCase() as 'ASC' | 'DESC';

    const colMap: Record<string, string> = {
      statDate: 'mds.mds_stat_date',
      totalVisitors: 'mds.mds_total_visitors',
      visits: 'mds.mds_visits',
      newVisitors: 'mds.mds_new_visitors',
      returningVisitors: 'mds.mds_returning_visitors',
      pageViews: 'mds.mds_page_views',
      appInstalls: 'mds.mds_app_installs',
      memberSignups: 'mds.mds_member_signups',
      salesCount: 'mds.mds_sales_count',
    };
    const orderCol = colMap[sortBy] ?? 'mds.mds_stat_date';

    const qb = this.repo.createQueryBuilder('mds').orderBy(orderCol, sortOrder);

    if (dto.startDate) {
      qb.andWhere('mds.mds_stat_date >= :startDate', { startDate: dto.startDate });
    }
    if (dto.endDate) {
      qb.andWhere('mds.mds_stat_date <= :endDate', { endDate: dto.endDate });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<MallDailyStat> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('해당 일별 통계를 찾을 수 없습니다.');
    return row;
  }

  async findByDate(statDate: string): Promise<MallDailyStat | null> {
    return this.repo.findOne({ where: { statDate } });
  }

  async create(dto: CreateMallDailyStatDto): Promise<MallDailyStat> {
    const existing = await this.findByDate(dto.statDate);
    if (existing) {
      throw new ConflictException(`해당 날짜(${dto.statDate})의 데이터가 이미 있습니다.`);
    }
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateMallDailyStatDto): Promise<MallDailyStat> {
    const entity = await this.findOne(id);
    if (dto.statDate !== undefined && dto.statDate !== entity.statDate) {
      const existing = await this.findByDate(dto.statDate);
      if (existing) {
        throw new ConflictException(`해당 날짜(${dto.statDate})의 데이터가 이미 있습니다.`);
      }
    }
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
  }
}
