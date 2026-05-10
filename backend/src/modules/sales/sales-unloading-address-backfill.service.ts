import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sales } from './entities/sales.entity';
import { GetSalesDto } from './dto/get-sales.dto';
import { BackfillSalesUnloadingAddressDto } from './dto/backfill-sales-unloading-address.dto';
import { applySalesListFiltersToQueryBuilder } from './sales-list-filters.helper';
import type { KakaoAddressSearchDoc } from '../customers/kakao-local-address.service';
import { KakaoLocalAddressService } from '../customers/kakao-local-address.service';

export type SalesUnloadingAddressBackfillFailure = {
  salesId: string;
  /** 표시용 레거시 하차지 주소 앞부분 */
  legacyAddressPreview: string;
  reason: string;
  /** 마지막으로 시도한 카카오 검색어 (있을 때) */
  lastQueryTried?: string | null;
};

export type SalesUnloadingAddressBackfillResult = {
  ok: boolean;
  message?: string;
  dryRun?: boolean;
  eligibleCount: number;
  processed: number;
  successCount: number;
  failureCount: number;
  failures: SalesUnloadingAddressBackfillFailure[];
};

function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

function buildUnloadingSearchQueryVariants(s: Sales): string[] {
  const zip = String(s.unloadingPostalCode ?? '')
    .replace(/\s/g, '')
    .trim();
  const detail = String(s.unloadingAddressDetail ?? '').trim();
  const legacy = String(s.unloadingAddress ?? '').trim();
  const region = String(s.unloadingRegion ?? '').trim();
  const city = String(s.unloadingCity ?? '').trim();

  const regionAlias = (s0: string) =>
    s0
      .replace(/강원특별자치도/g, '강원도')
      .replace(/전북특별자치도/g, '전라북도');

  const cores = new Set<string>();
  const addCore = (base: string) => {
    const x = [base, detail].filter(Boolean).join(' ').trim();
    if (x) cores.add(x);
  };
  addCore(legacy);
  if (legacy) cores.add(legacy);

  const out: string[] = [];
  for (const core of cores) {
    if (!core) continue;
    out.push(core);
    const aliased = regionAlias(core);
    if (aliased !== core) out.push(aliased);
    if (zip) {
      out.push(`${core} ${zip}`);
      const ac = regionAlias(core);
      if (ac !== core) out.push(`${ac} ${zip}`);
    }
  }
  const zipFirst = [zip, legacy, detail].filter(Boolean).join(' ').trim();
  if (zipFirst && !out.includes(zipFirst)) out.push(zipFirst);
  if (region && city) {
    const rc = `${region} ${city}`.trim();
    if (rc.replace(/\s/g, '').length >= 2) out.push(rc);
  }
  return [...new Set(out.filter((q) => q.replace(/\s/g, '').length >= 2))];
}

@Injectable()
export class SalesUnloadingAddressBackfillService {
  private readonly logger = new Logger(SalesUnloadingAddressBackfillService.name);

  constructor(
    @InjectRepository(Sales)
    private readonly salesRepository: Repository<Sales>,
    private readonly kakaoLocal: KakaoLocalAddressService,
  ) {}

  private normalizeBCode(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const d = String(raw).replace(/\D/g, '');
    if (!d) return null;
    return d.padStart(10, '0').slice(0, 10);
  }

  private extractFromDoc(first: KakaoAddressSearchDoc | undefined) {
    const jibun = first?.address;
    const bCode = this.normalizeBCode(jibun?.b_code);
    return {
      road: first?.road_address?.address_name?.trim() || null,
      jibun: jibun?.address_name?.trim() || null,
      bCode,
    };
  }

  private createFilteredIdsQuery(filterDto: GetSalesDto) {
    const qb = this.salesRepository
      .createQueryBuilder('sales')
      .leftJoin('sales.customer', 'customer')
      .leftJoin('sales.items', 'items')
      .leftJoin('items.container', 'container')
      .leftJoin('container.order', 'order', 'order.to_deleted_at IS NULL')
      .leftJoin('order.contract', 'contract', 'contract.tc_deleted_at IS NULL')
      .leftJoin('order.inbounds', 'inbounds');

    applySalesListFiltersToQueryBuilder(qb, filterDto);

    qb.andWhere(`TRIM(COALESCE(sales.sa_unloading_address, '')) <> ''`);
    qb.andWhere(
      `(
        TRIM(COALESCE(sales.sa_unloading_address_road, '')) = '' OR sales.sa_unloading_address_road IS NULL
        OR TRIM(COALESCE(sales.sa_unloading_address_jibun, '')) = '' OR sales.sa_unloading_address_jibun IS NULL
        OR TRIM(COALESCE(sales.sa_unloading_legal_b_code, '')) = '' OR sales.sa_unloading_legal_b_code IS NULL
      )`,
    );

    return qb;
  }

  async collectEligibleIds(filterDto: GetSalesDto): Promise<string[]> {
    const qb = this.createFilteredIdsQuery(filterDto);
    qb.select('sales.id', 'id').groupBy('sales.id').orderBy('sales.id', 'ASC');
    const rows = await qb.getRawMany();
    return rows
      .map((r) => String(r.id ?? r.sales_sa_id ?? r.sales_id ?? ''))
      .filter((id) => id.length > 0);
  }

  async run(dto: BackfillSalesUnloadingAddressDto): Promise<SalesUnloadingAddressBackfillResult> {
    const { dryRun, ...filterDto } = dto;

    if (!this.kakaoLocal.getRestApiKey()) {
      throw new BadRequestException(
        'KAKAO_REST_API_KEY 가 설정되지 않았습니다. backend 환경변수를 확인하세요.',
      );
    }

    const ids = await this.collectEligibleIds(filterDto as GetSalesDto);

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        eligibleCount: ids.length,
        processed: 0,
        successCount: 0,
        failureCount: 0,
        failures: [],
      };
    }

    const failures: SalesUnloadingAddressBackfillFailure[] = [];
    let successCount = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 160));
      }

      const sale = await this.salesRepository.findOne({
        where: { id },
        select: [
          'id',
          'unloadingAddress',
          'unloadingAddressDetail',
          'unloadingPostalCode',
          'unloadingRegion',
          'unloadingCity',
          'unloadingAddressRoad',
          'unloadingAddressJibun',
          'unloadingLegalBCode',
        ],
      });

      if (!sale) {
        failures.push({
          salesId: id,
          legacyAddressPreview: '',
          reason: 'DB에서 판매를 찾을 수 없음',
        });
        continue;
      }

      const legacy = String(sale.unloadingAddress ?? '').trim();
      if (!legacy) {
        failures.push({
          salesId: id,
          legacyAddressPreview: '',
          reason: '레거시 하차지 주소 없음',
        });
        continue;
      }

      const needRoad = isBlank(sale.unloadingAddressRoad);
      const needJibun = isBlank(sale.unloadingAddressJibun);
      const needLegal = isBlank(sale.unloadingLegalBCode);
      if (!needRoad && !needJibun && !needLegal) {
        continue;
      }

      const queries = buildUnloadingSearchQueryVariants(sale);
      if (queries.length === 0) {
        failures.push({
          salesId: id,
          legacyAddressPreview: legacy.slice(0, 80),
          reason: '카카오 검색어를 만들 수 없음',
        });
        continue;
      }

      let lastQuery: string | null = null;
      let picked: { road: string | null; jibun: string | null; bCode: string | null } | null = null;

      try {
        for (const q of queries) {
          lastQuery = q;
          const res = await this.kakaoLocal.searchAddress(q, 8);
          if (res.documents?.length) {
            picked = this.extractFromDoc(res.documents[0]);
            break;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[sales-unloading-backfill] salesId=${id} kakao error: ${msg}`);
        failures.push({
          salesId: id,
          legacyAddressPreview: legacy.slice(0, 80),
          reason: `카카오 API 오류: ${msg}`,
          lastQueryTried: lastQuery,
        });
        continue;
      }

      if (!picked || (!picked.road && !picked.jibun && !picked.bCode)) {
        failures.push({
          salesId: id,
          legacyAddressPreview: legacy.slice(0, 80),
          reason: '카카오 검색 결과 없음',
          lastQueryTried: lastQuery,
        });
        continue;
      }

      const patch: {
        unloadingAddressRoad?: string;
        unloadingAddressJibun?: string;
        unloadingLegalBCode?: string;
      } = {};
      if (needRoad && picked.road) patch.unloadingAddressRoad = picked.road;
      if (needJibun && picked.jibun) patch.unloadingAddressJibun = picked.jibun;
      if (needLegal && picked.bCode) patch.unloadingLegalBCode = picked.bCode;

      if (Object.keys(patch).length === 0) {
        failures.push({
          salesId: id,
          legacyAddressPreview: legacy.slice(0, 80),
          reason: '카카오 결과는 있으나 필요한 필드를 채울 수 없음',
          lastQueryTried: lastQuery,
        });
        continue;
      }

      try {
        await this.salesRepository.update({ id }, patch);
        successCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({
          salesId: id,
          legacyAddressPreview: legacy.slice(0, 80),
          reason: `DB 저장 실패: ${msg}`,
          lastQueryTried: lastQuery,
        });
      }
    }

    return {
      ok: true,
      eligibleCount: ids.length,
      processed: ids.length,
      successCount,
      failureCount: failures.length,
      failures,
    };
  }
}
