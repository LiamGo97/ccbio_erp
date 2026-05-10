import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FreeTime } from './entities/free-time.entity';
import { CreateFreeTimeDto } from './dto/create-free-time.dto';
import { UpdateFreeTimeDto } from './dto/update-free-time.dto';
import { Code } from '../codes/entities/code.entity';

interface FreeTimeFilter {
  exporterCode?: string;
  shippingLineCode?: string;
  type?: string;
  baseDate?: string;
}

@Injectable()
export class FreeTimeService {
  constructor(
    @InjectRepository(FreeTime)
    private readonly freeTimeRepository: Repository<FreeTime>,
    @InjectRepository(Code)
    private readonly codeRepository: Repository<Code>,
  ) {}

  async findAll(filter: FreeTimeFilter = {}) {
    const qb = this.freeTimeRepository.createQueryBuilder('ft');

    if (filter.exporterCode) {
      qb.andWhere('ft.exporterCode = :exporterCode', {
        exporterCode: filter.exporterCode.trim().toUpperCase(),
      });
    }

    if (filter.shippingLineCode) {
      qb.andWhere('ft.shippingLineCode = :shippingLineCode', {
        shippingLineCode: filter.shippingLineCode.trim().toUpperCase(),
      });
    }

    if (filter.type) {
      qb.andWhere('ft.type = :type', { type: filter.type.trim().toUpperCase() });
    }

    if (filter.baseDate) {
      qb.andWhere('ft.baseDate = :baseDate', { baseDate: filter.baseDate });
    }

    qb
      .orderBy('ft.exporterCode', 'ASC')
      .addOrderBy('ft.shippingLineCode', 'ASC')
      .addOrderBy('ft.type', 'ASC')
      .addOrderBy('ft.baseDate', 'DESC');

    const entities = await qb.getMany();
    const enriched = await this.enrichWithCodeNames(entities);
    return enriched;
  }

  async calculateFreeTimeDates(params: {
    exporterCode: string;
    shippingLineCode: string;
    eta: string;
  }) {
    const exporterCode = params.exporterCode?.trim()?.toUpperCase();
    const shippingLineCode = params.shippingLineCode?.trim()?.toUpperCase();
    const etaInput = params.eta?.trim();

    if (!exporterCode || !shippingLineCode || !etaInput) {
      throw new BadRequestException('exporterCode, shippingLineCode, eta 값을 모두 제공해야 합니다.');
    }

    const etaDate = this.parseDateString(etaInput);
    if (!etaDate) {
      throw new BadRequestException('유효한 ETA 값을 입력해주세요.');
    }

    const calculateForType = async (type: 'DM' | 'DT' | 'CB') => {
      const entry = await this.findApplicableFreeTime(exporterCode, shippingLineCode, type, etaDate);
      if (!entry) {
        return { date: null, offset: null };
      }
      const offset = Number(entry.value);
      if (!Number.isFinite(offset)) {
        return { date: null, offset: null };
      }
      const appliedDate = this.addDays(etaDate, offset);
      return { date: this.formatDate(appliedDate), offset };
    };

    const [dm, dt, cb] = await Promise.all([
      calculateForType('DM'),
      calculateForType('DT'),
      calculateForType('CB'),
    ]);

    return {
      dmDate: dm.date,
      dmOffsetDays: dm.offset,
      dtDate: dt.date,
      dtOffsetDays: dt.offset,
      cbDate: cb.date,
      cbOffsetDays: cb.offset,
    };
  }

  async create(dto: CreateFreeTimeDto) {
    const exporterCode = dto.exporterCode.trim().toUpperCase();
    const shippingLineCode = dto.shippingLineCode.trim().toUpperCase();
    const type = dto.type.trim().toUpperCase();
    const baseDate = dto.baseDate.trim();

    const existing = await this.freeTimeRepository.findOne({
      where: { exporterCode, shippingLineCode, type, baseDate },
    });
    if (existing) {
      throw new BadRequestException('이미 동일한 수출사/선사/유형/기준일 조합이 존재합니다.');
    }

    const entity = this.freeTimeRepository.create({
      exporterCode,
      shippingLineCode,
      type,
      baseDate,
      value: this.normalizeString(dto.value),
    });

    const saved = await this.freeTimeRepository.save(entity);
    const [enriched] = await this.enrichWithCodeNames([saved]);
    return enriched;
  }

  async update(id: string, dto: UpdateFreeTimeDto) {
    const entity = await this.freeTimeRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('해당 FT 정보를 찾을 수 없습니다.');
    }

    let exporterCode = entity.exporterCode;
    let shippingLineCode = entity.shippingLineCode;
    let type = entity.type;
    let baseDate = entity.baseDate;

    if (dto.exporterCode) {
      exporterCode = dto.exporterCode.trim().toUpperCase();
    }

    if (dto.shippingLineCode) {
      shippingLineCode = dto.shippingLineCode.trim().toUpperCase();
    }

    if (dto.type) {
      type = dto.type.trim().toUpperCase();
    }

    if (dto.baseDate) {
      baseDate = dto.baseDate.trim();
    }

    if (
      (exporterCode !== entity.exporterCode ||
        shippingLineCode !== entity.shippingLineCode ||
        type !== entity.type ||
        baseDate !== entity.baseDate) &&
      (await this.freeTimeRepository.findOne({
        where: { exporterCode, shippingLineCode, type, baseDate },
      }))
    ) {
      throw new BadRequestException('이미 동일한 수출사/선사/유형/기준일 조합이 존재합니다.');
    }

    entity.exporterCode = exporterCode;
    entity.shippingLineCode = shippingLineCode;
    entity.type = type;
    entity.baseDate = baseDate;
    if (dto.value !== undefined) {
      entity.value = this.normalizeString(dto.value);
    }

    const saved = await this.freeTimeRepository.save(entity);
    const [enriched] = await this.enrichWithCodeNames([saved]);
    return enriched;
  }

  async remove(id: string) {
    const entity = await this.freeTimeRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('해당 FT 정보를 찾을 수 없습니다.');
    }
    await this.freeTimeRepository.delete(id);
    return { success: true };
  }

  private normalizeString(value?: string | null) {
    if (value === null || value === undefined) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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

  private addDays(date: Date, days: number): Date {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private formatDate(date: Date | null): string | null {
    if (!date) {
      return null;
    }
    return date.toISOString().split('T')[0];
  }

  private async findApplicableFreeTime(
    exporterCode: string,
    shippingLineCode: string,
    type: 'DM' | 'DT' | 'CB',
    etaDate: Date,
  ): Promise<FreeTime | null> {
    const qb = this.freeTimeRepository
      .createQueryBuilder('ft')
      .where('ft.exporterCode = :exporterCode', { exporterCode })
      .andWhere('ft.shippingLineCode = :shippingLineCode', { shippingLineCode })
      .andWhere('ft.type = :type', { type })
      .andWhere('ft.baseDate <= :baseDate', { baseDate: etaDate })
      .orderBy('ft.baseDate', 'DESC')
      .limit(1);

    let match = await qb.getOne();

    if (!match) {
      match = await this.freeTimeRepository.findOne({
        where: {
          exporterCode,
          shippingLineCode,
          type,
        },
        order: {
          baseDate: 'DESC',
        },
      });
    }

    return match ?? null;
  }

  private async enrichWithCodeNames(entities: FreeTime[]) {
    if (!entities.length) {
      return [];
    }

    const codes = await this.codeRepository.find({
      where: {
        group: In(['EXPORTER', 'SHIPPING_LINE']),
      },
    });

    const exporterMap = new Map(
      codes
        .filter((code) => code.group === 'EXPORTER' && code.value)
        .map((code) => [code.value!.trim().toUpperCase(), code.name ?? code.value]),
    );

    const shippingLineMap = new Map(
      codes
        .filter((code) => code.group === 'SHIPPING_LINE' && code.value)
        .map((code) => [code.value!.trim().toUpperCase(), code.name ?? code.value]),
    );

    return entities.map((entity) => ({
      ...entity,
      exporterName: exporterMap.get(entity.exporterCode) ?? entity.exporterCode,
      shippingLineName: shippingLineMap.get(entity.shippingLineCode) ?? entity.shippingLineCode,
    }));
  }
}



