import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WarehouseIgobi } from './entities/warehouse-igobi.entity';
import { CreateWarehouseIgobiDto } from './dto/create-warehouse-igobi.dto';
import { UpdateWarehouseIgobiDto } from './dto/update-warehouse-igobi.dto';
import { Warehouse } from '../warehouse/entities/warehouse.entity';

interface WarehouseIgobiFilter {
  warehouseId?: number;
  baseDate?: string;
}

@Injectable()
export class WarehouseIgobiService {
  constructor(
    @InjectRepository(WarehouseIgobi)
    private readonly warehouseIgobiRepository: Repository<WarehouseIgobi>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
  ) {}

  async findAll(filter: WarehouseIgobiFilter = {}) {
    const qb = this.warehouseIgobiRepository.createQueryBuilder('wi')
      .leftJoinAndSelect('wi.warehouse', 'warehouse');

    if (filter.warehouseId) {
      qb.andWhere('wi.warehouseId = :warehouseId', {
        warehouseId: filter.warehouseId,
      });
    }

    if (filter.baseDate) {
      qb.andWhere('wi.baseDate = :baseDate', { baseDate: filter.baseDate });
    }

    qb
      .orderBy('warehouse.name', 'ASC')
      .addOrderBy('wi.baseDate', 'DESC');

    const entities = await qb.getMany();
    return entities.map((entity) => ({
      ...entity,
      warehouseName: entity.warehouse?.name || null,
    }));
  }

  async findApplicableIgobi(warehouseCode: string, targetDate: string): Promise<number | null> {
    // warehouseCode로 Warehouse 엔티티 찾기
    const warehouse = await this.warehouseRepository.findOne({
      where: { name: warehouseCode.trim() },
    });

    if (!warehouse) {
      return null;
    }

    return this.findApplicableIgobiByWarehouseId(warehouse.id, targetDate);
  }

  async findApplicableIgobiByWarehouseId(warehouseId: number, targetDate: string): Promise<number | null> {
    const targetDateObj = this.parseDateString(targetDate);
    
    if (!targetDateObj) {
      return null;
    }

    const qb = this.warehouseIgobiRepository
      .createQueryBuilder('wi')
      .where('wi.warehouseId = :warehouseId', { warehouseId })
      .andWhere('wi.baseDate <= :targetDate', { targetDate: targetDateObj })
      .orderBy('wi.baseDate', 'DESC')
      .limit(1);

    const match = await qb.getOne();

    if (!match) {
      // 기준일 이전 데이터가 없으면 가장 최근 데이터 사용
      const latest = await this.warehouseIgobiRepository.findOne({
        where: {
          warehouseId,
        },
        order: {
          baseDate: 'DESC',
        },
      });
      return latest ? Number(latest.igobi) : null;
    }

    return Number(match.igobi);
  }

  async findLatestIgobiByWarehouseIds(warehouseIds: number[]): Promise<Map<number, { baseDate: string; igobi: number }>> {
    if (warehouseIds.length === 0) {
      return new Map();
    }

    // 각 창고별로 가장 최근 이고비 조회 (DISTINCT ON 사용)
    // PostgreSQL의 DISTINCT ON을 사용하여 각 창고별로 가장 최근 기준일의 이고비를 조회
    const latestIgobis = await this.warehouseIgobiRepository
      .createQueryBuilder('wi')
      .where('wi.warehouseId IN (:...warehouseIds)', { warehouseIds })
      .orderBy('wi.warehouseId', 'ASC')
      .addOrderBy('wi.baseDate', 'DESC')
      .getMany();

    // 각 창고별로 첫 번째 항목(가장 최근 기준일)만 선택
    const igobiMap = new Map<number, { baseDate: string; igobi: number }>();
    const seenWarehouseIds = new Set<number>();
    
    latestIgobis.forEach((igobi) => {
      if (!seenWarehouseIds.has(igobi.warehouseId)) {
        seenWarehouseIds.add(igobi.warehouseId);
        igobiMap.set(igobi.warehouseId, {
          baseDate: igobi.baseDate,
          igobi: Number(igobi.igobi),
        });
      }
    });

    return igobiMap;
  }

  async create(dto: CreateWarehouseIgobiDto) {
    // warehouseId로 Warehouse 엔티티 확인
    const warehouse = await this.warehouseRepository.findOne({
      where: { id: dto.warehouseId },
    });

    if (!warehouse) {
      throw new BadRequestException('창고를 찾을 수 없습니다.');
    }

    const baseDate = dto.baseDate.trim();

    const existing = await this.warehouseIgobiRepository.findOne({
      where: { warehouseId: dto.warehouseId, baseDate },
    });

    if (existing) {
      throw new BadRequestException('이미 동일한 창고/기준일 조합이 존재합니다.');
    }

    const entity = this.warehouseIgobiRepository.create({
      warehouseId: dto.warehouseId,
      baseDate,
      igobi: dto.igobi,
    });

    const saved = await this.warehouseIgobiRepository.save(entity);
    await saved.warehouse; // 관계 로드
    return {
      ...saved,
      warehouseName: warehouse.name,
    };
  }

  async update(id: string, dto: UpdateWarehouseIgobiDto) {
    const entity = await this.warehouseIgobiRepository.findOne({ 
      where: { id },
      relations: ['warehouse'],
    });
    if (!entity) {
      throw new NotFoundException('해당 창고 이고비 정보를 찾을 수 없습니다.');
    }

    let warehouseId = entity.warehouseId;
    let baseDate = entity.baseDate;

    if (dto.warehouseId !== undefined) {
      const warehouse = await this.warehouseRepository.findOne({
        where: { id: dto.warehouseId },
      });
      if (!warehouse) {
        throw new BadRequestException('창고를 찾을 수 없습니다.');
      }
      warehouseId = dto.warehouseId;
    }

    if (dto.baseDate) {
      baseDate = dto.baseDate.trim();
    }

    if (
      (warehouseId !== entity.warehouseId || baseDate !== entity.baseDate) &&
      (await this.warehouseIgobiRepository.findOne({
        where: { warehouseId, baseDate },
      }))
    ) {
      throw new BadRequestException('이미 동일한 창고/기준일 조합이 존재합니다.');
    }

    entity.warehouseId = warehouseId;
    entity.baseDate = baseDate;
    if (dto.igobi !== undefined) {
      entity.igobi = dto.igobi;
    }

    const saved = await this.warehouseIgobiRepository.save(entity);
    const warehouse = await this.warehouseRepository.findOne({ where: { id: saved.warehouseId } });
    return {
      ...saved,
      warehouseName: warehouse?.name || null,
    };
  }

  async remove(id: string) {
    const entity = await this.warehouseIgobiRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('해당 창고 이고비 정보를 찾을 수 없습니다.');
    }
    await this.warehouseIgobiRepository.delete(id);
    return { success: true };
  }

  private parseDateString(value: string): Date | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = new Date(`${trimmed}T00:00:00.000Z`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }

}

