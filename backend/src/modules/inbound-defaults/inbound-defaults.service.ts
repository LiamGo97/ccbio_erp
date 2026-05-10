import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InboundDefaultSetting } from './entities/inbound-default-setting.entity';
import { UpdateInboundDefaultsDto } from './dto/update-inbound-defaults.dto';

@Injectable()
export class InboundDefaultsService {
  private readonly logger = new Logger(InboundDefaultsService.name);

  constructor(
    @InjectRepository(InboundDefaultSetting)
    private readonly settingRepository: Repository<InboundDefaultSetting>,
  ) {}

  /**
   * 입고 기본 설정 조회 (USD, EUR)
   */
  async getDefaults(): Promise<{
    defaultExchangeRateUsd: number;
    defaultExchangeRateEur: number;
  }> {
    const [latest] = await this.settingRepository.find({
      order: { changedAt: 'DESC' },
      take: 1,
    });
    const usdRaw = latest?.valueUsd != null ? String(latest.valueUsd).trim() : '';
    const eurRaw = latest?.valueEur != null ? String(latest.valueEur).trim() : '';
    const usd = usdRaw !== '' ? parseFloat(usdRaw) : 1400;
    const eur = eurRaw !== '' ? parseFloat(eurRaw) : 1550;
    return {
      defaultExchangeRateUsd: Number.isFinite(usd) ? usd : 1400,
      defaultExchangeRateEur: Number.isFinite(eur) ? eur : 1550,
    };
  }

  /**
   * 입고 기본 설정 업데이트 (USD, EUR 한 번에 저장)
   */
  async updateDefaults(
    dto: UpdateInboundDefaultsDto,
    userId?: number | null,
  ): Promise<{
    defaultExchangeRateUsd: number;
    defaultExchangeRateEur: number;
  }> {
    const usd = dto.defaultExchangeRateUsd;
    const eur = dto.defaultExchangeRateEur;

    await this.settingRepository.save({
      valueUsd: String(usd),
      valueEur: String(eur),
      changedById: userId ?? null,
    });

    this.logger.log(
      `[updateDefaults] 예정 환율 기본값: USD ${usd}, EUR ${eur}`,
    );

    return {
      defaultExchangeRateUsd: usd,
      defaultExchangeRateEur: eur,
    };
  }

  /**
   * 변경 이력 조회
   */
  async getHistory(limit = 50): Promise<
    {
      id: number;
      valueUsd: string;
      valueEur: string;
      changedAt: string;
      changedByName: string | null;
    }[]
  > {
    const rows = await this.settingRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.changedBy', 'u')
      .orderBy('s.changedAt', 'DESC')
      .take(limit)
      .getMany();

    return rows.map((r) => ({
      id: r.id,
      valueUsd: r.valueUsd != null && String(r.valueUsd).trim() !== '' ? String(r.valueUsd) : '0',
      valueEur: r.valueEur != null && String(r.valueEur).trim() !== '' ? String(r.valueEur) : '0',
      changedAt: r.changedAt?.toISOString?.() ?? new Date().toISOString(),
      changedByName: r.changedBy?.name ?? null,
    }));
  }
}
