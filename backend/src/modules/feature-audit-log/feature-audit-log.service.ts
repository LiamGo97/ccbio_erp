import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureAuditLog } from './entities/feature-audit-log.entity';
import { CreateFeatureAuditLogDto } from './dto/create-feature-audit-log.dto';
import { GetFeatureAuditLogsDto } from './dto/get-feature-audit-logs.dto';

export interface GetFeatureAuditLogsResponse {
  data: FeatureAuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class FeatureAuditLogService {
  constructor(
    @InjectRepository(FeatureAuditLog)
    private readonly repo: Repository<FeatureAuditLog>,
  ) {}

  /** 로그 한 건 기록 (다른 모듈에서 호출 또는 API로 수동 등록) */
  async create(dto: CreateFeatureAuditLogDto): Promise<FeatureAuditLog> {
    const entityId =
      dto.entityId != null && !Number.isNaN(Number(dto.entityId)) ? Number(dto.entityId) : null;
    const log = this.repo.create({
      domain: dto.domain,
      feature: dto.feature,
      action: dto.action,
      userId: dto.userId ?? null,
      summary: dto.summary,
      entityType: dto.entityType ?? null,
      entityId,
      payload: dto.payload ?? null,
      oldData: dto.oldData ?? null,
      newData: dto.newData ?? null,
      changedFields: dto.changedFields ?? null,
      description: dto.description ?? null,
    });
    return this.repo.save(log);
  }

  /** 목록 조회 (필터·페이징) */
  async findAll(params: GetFeatureAuditLogsDto): Promise<GetFeatureAuditLogsResponse> {
    const {
      page = 1,
      limit = 20,
      domain,
      feature,
      action,
      userId,
      from,
      to,
      summary,
      entityType,
      entityId,
    } = params;

    const qb = this.repo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC');

    if (domain) {
      qb.andWhere('log.domain = :domain', { domain });
    }
    if (feature) {
      qb.andWhere('log.feature = :feature', { feature });
    }
    if (action) {
      qb.andWhere('log.action = :action', { action });
    }
    if (userId != null) {
      qb.andWhere('log.userId = :userId', { userId });
    }
    if (from) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      qb.andWhere('log.createdAt >= :from', { from: fromDate });
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      qb.andWhere('log.createdAt <= :to', { to: toDate });
    }
    if (summary && summary.trim()) {
      qb.andWhere('log.summary ILIKE :summary', { summary: `%${summary.trim()}%` });
    }
    if (entityType) {
      qb.andWhere('log.entityType = :entityType', { entityType });
    }
    if (entityId != null) {
      qb.andWhere('log.entityId = :entityId', { entityId });
    }

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);

    const data = await qb.getMany();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /** 상세 조회 (단일 건, user 포함) */
  async findOne(id: number): Promise<FeatureAuditLog> {
    const log = await this.repo.findOne({
      where: { id: Number(id) },
      relations: ['user'],
    });
    if (!log) {
      throw new NotFoundException(`기능 이력을 찾을 수 없습니다. (id: ${id})`);
    }
    return log;
  }
}
