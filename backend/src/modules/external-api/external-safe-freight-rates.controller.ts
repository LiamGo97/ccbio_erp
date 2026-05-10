import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { LegalAdminMasterService } from '../legal-admin-master/legal-admin-master.service';
import { SafeFreightRate } from '../safe-freight-rate/entities/safe-freight-rate.entity';
import { SafeFreightRateService } from '../safe-freight-rate/safe-freight-rate.service';

/** 몰·외부 시스템용 페이지 상한 (과도한 조회 방지) */
const EXTERNAL_SAFE_FREIGHT_MAX_LIMIT = 500;

/** `legalBCode` 쿼리 사용 시 응답에 포함 — 몰에서 매칭된 행정구역 확인용 */
export type ExternalSafeFreightResolvedFromLegalBCode = {
  legalBCode: string;
  regionName: string;
  cityName: string;
  townName: string;
};

export type ExternalSafeFreightRateRow = {
  id: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  portCodeId: number | null;
  /** 코드 마스터 표시명 (항구명 등) */
  portName: string | null;
  /** 코드 값(DESTINATION_PORT 등) */
  portCodeValue: string | null;
  regionName: string;
  cityName: string;
  townName: string;
  distanceKm: number | null;
  containerSize: string;
  /** 안전운송운임(원) */
  safeTransportRate: number;
};

function toIsoDateOnly(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function mapRate(row: SafeFreightRate): ExternalSafeFreightRateRow {
  const raw = row.safeTransportRate as unknown;
  const safeTransportRate =
    typeof raw === 'number' ? raw : raw != null ? Number(raw) : 0;
  return {
    id: row.id,
    effectiveFrom: toIsoDateOnly(row.effectiveFrom) ?? '',
    effectiveTo: toIsoDateOnly(row.effectiveTo ?? null),
    portCodeId: row.portCodeId ?? null,
    portName: row.portCode?.name ?? null,
    portCodeValue: row.portCode?.value ?? null,
    regionName: row.regionName,
    cityName: row.cityName,
    townName: row.townName,
    distanceKm: row.distanceKm ?? null,
    containerSize: row.containerSize,
    safeTransportRate: Number.isFinite(safeTransportRate) ? safeTransportRate : 0,
  };
}

/**
 * 이커머스 등 외부 시스템 → ERP 안전운임 요금 조회 (읽기 전용)
 */
@ApiTags('External API (안전운임)')
@ApiHeader({
  name: 'X-API-Key',
  description: '외부 API 인증 키 (EXTERNAL_API_KEY 환경변수와 일치)',
  required: true,
})
@Controller('external/safe-freight-rates')
@UseGuards(ApiKeyGuard)
export class ExternalSafeFreightRatesController {
  constructor(
    private readonly safeFreightRateService: SafeFreightRateService,
    private readonly legalAdminMasterService: LegalAdminMasterService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '안전운임 요금 목록 조회',
    description:
      'ERP에 엑셀 등으로 적재된 안전운임 요금표를 페이지 단위로 조회합니다. `legalBCode`(법정동코드)가 있으면 `tb_legal_admin_master`로 시·도·시군구·읍면동을 풀어 `region`/`city`/`townName`과 동일하게 필터합니다(해당 파라미터가 같이 오면 **법정동이 우선**). 고객 동기화 API와 동일하게 `X-API-Key` 인증. 상세: docs/EXTERNAL_API.md',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 100, description: `최대 ${EXTERNAL_SAFE_FREIGHT_MAX_LIMIT}` })
  @ApiQuery({ name: 'sortBy', required: false, example: 'effectiveFrom' })
  @ApiQuery({ name: 'sortOrder', required: false, example: 'desc', enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'region', required: false, description: '시·도 (regionName 정확 일치)' })
  @ApiQuery({ name: 'city', required: false, description: '시·군·구 (cityName 정확 일치)' })
  @ApiQuery({ name: 'townName', required: false, description: '읍·면·동 (정확 일치)' })
  @ApiQuery({ name: 'portCodeId', required: false, description: 'tb_code.cd_id (DESTINATION_PORT)' })
  @ApiQuery({ name: 'distanceKm', required: false, description: '구간 거리(km) 정확 일치' })
  @ApiQuery({
    name: 'effectiveDate',
    required: false,
    example: '2026-04-20',
    description: '해당일에 유효한 요금만 (시행 시작≤일≤시행 종료 또는 종료 없음). 생략 시 날짜 필터 없음',
  })
  @ApiQuery({
    name: 'legalBCode',
    required: false,
    example: '1168010100',
    description:
      '법정동코드(숫자 10자리, 하이픈·공백 무시). 지정 시 ERP 법정동 마스터에서 시·도·시군구·읍면동으로 변환 후 조회. 마스터에 없으면 400',
  })
  async list(
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('region') region?: string,
    @Query('city') city?: string,
    @Query('townName') townName?: string,
    @Query('portCodeId') portCodeIdRaw?: string,
    @Query('distanceKm') distanceKmRaw?: string,
    @Query('effectiveDate') effectiveDateRaw?: string,
    @Query('legalBCode') legalBCodeRaw?: string,
  ): Promise<{
    data: ExternalSafeFreightRateRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    resolvedFromLegalBCode?: ExternalSafeFreightResolvedFromLegalBCode;
  }> {
    const page = Math.max(1, pageRaw ? parseInt(pageRaw, 10) || 1 : 1);
    const limitParsed = limitRaw ? parseInt(limitRaw, 10) : 100;
    const limit = Math.min(
      EXTERNAL_SAFE_FREIGHT_MAX_LIMIT,
      Math.max(1, Number.isFinite(limitParsed) ? limitParsed : 100),
    );

    const portParsed = portCodeIdRaw?.trim()
      ? parseInt(portCodeIdRaw, 10)
      : Number.NaN;
    const distParsed = distanceKmRaw?.trim()
      ? parseInt(distanceKmRaw, 10)
      : Number.NaN;

    let resolvedFromLegalBCode: ExternalSafeFreightResolvedFromLegalBCode | undefined;
    let regionName = region?.trim() || undefined;
    let cityName = city?.trim() || undefined;
    let townNameFilter = townName?.trim() || undefined;

    if (legalBCodeRaw != null && String(legalBCodeRaw).trim() !== '') {
      const resolved =
        await this.legalAdminMasterService.resolveAddressLabelsByLegalBCode(
          legalBCodeRaw,
        );
      if (!resolved) {
        throw new BadRequestException(
          '법정동코드를 법정동 마스터에서 찾을 수 없습니다. `tb_legal_admin_master`에 해당 코드가 있고 삭제되지 않았는지 확인하세요.',
        );
      }
      resolvedFromLegalBCode = resolved;
      regionName = resolved.regionName.trim()
        ? resolved.regionName.trim()
        : undefined;
      cityName = resolved.cityName.trim() ? resolved.cityName.trim() : undefined;
      townNameFilter = resolved.townName.trim()
        ? resolved.townName.trim()
        : undefined;
    }

    const result = await this.safeFreightRateService.findAll({
      page,
      limit,
      sortBy: sortBy || 'effectiveFrom',
      sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : 'desc',
      regionName,
      cityName,
      townName: townNameFilter,
      portCodeId: Number.isFinite(portParsed) ? portParsed : undefined,
      distanceKm: Number.isFinite(distParsed) ? distParsed : undefined,
      effectiveDate: effectiveDateRaw?.trim()
        ? new Date(effectiveDateRaw.trim())
        : undefined,
    });

    return {
      data: result.data.map(mapRate),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      ...(resolvedFromLegalBCode != null
        ? { resolvedFromLegalBCode }
        : {}),
    };
  }

  @Get('regions')
  @ApiOperation({ summary: '요금표에 등장하는 지역(시·도) 목록' })
  async regions(): Promise<string[]> {
    return this.safeFreightRateService.getRegionNames();
  }

  @Get('cities')
  @ApiOperation({ summary: '특정 지역의 시·군·구 목록' })
  @ApiQuery({ name: 'region', required: true })
  async cities(@Query('region') region?: string): Promise<string[]> {
    return this.safeFreightRateService.getCityNames(region?.trim() || '');
  }

  @Get('towns')
  @ApiOperation({ summary: '특정 지역·시군구의 읍·면·동 목록' })
  @ApiQuery({ name: 'region', required: true })
  @ApiQuery({ name: 'city', required: true })
  async towns(
    @Query('region') region?: string,
    @Query('city') city?: string,
  ): Promise<string[]> {
    return this.safeFreightRateService.getTownNames(
      region?.trim() || '',
      city?.trim() || '',
    );
  }

  @Get('distances')
  @ApiOperation({ summary: '요금표에 사용 중인 거리(km) 구간 목록' })
  async distances(): Promise<number[]> {
    return this.safeFreightRateService.getDistanceKmList();
  }
}
