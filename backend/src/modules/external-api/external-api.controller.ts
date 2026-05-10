import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { TradeContractsService } from '../trade-contracts/trade-contracts.service';
import { filterZeroBalesWeight } from './external-api.utils';

/**
 * 외부 시스템(이커머스 등)에서 재고 정보를 조회하는 API
 * X-API-Key 헤더로 인증 (EXTERNAL_API_KEY 환경변수와 일치해야 함)
 */
@ApiTags('External API (재고)')
@ApiHeader({
  name: 'X-API-Key',
  description: '외부 API 인증 키 (EXTERNAL_API_KEY 환경변수와 일치)',
  required: true,
})
@Controller('external/inventory')
@UseGuards(ApiKeyGuard)
export class ExternalApiController {
  constructor(private readonly tradeContractsService: TradeContractsService) {}

  /**
   * BL 단위 재고 목록 (입고대기·입고예정·입고확정 통합)
   * 제외된 재고·판매완료 제외, 각 항목에 status 포함
   */
  @Get('by-bl')
  @ApiOperation({
    summary: 'BL 단위 재고 목록',
    description:
      '입고대기·입고예정·입고확정을 BL 단위로 통합. 제외된 재고·판매완료 제외. status: INBOUND_PENDING | INBOUND_SCHEDULED | INBOUND_CONFIRMED',
  })
  async getInventoryByBl() {
    return this.tradeContractsService.listInventoryByBl();
  }

  /**
   * 입고확정 재고 (주간재고현황과 동일)
   */
  @Get('confirmed')
  @ApiOperation({
    summary: '입고확정 재고',
    description: '주간재고현황과 동일한 데이터. 입고확정(INBOUND_CONFIRMED) 상태의 컨테이너 목록',
  })
  async getConfirmedInventory() {
    const containers = await this.tradeContractsService.getConfirmedInventoryForDashboard();
    return filterZeroBalesWeight(containers);
  }

  /**
   * 입고예정 재고 (통관전 재고와 동일)
   * @param month - YYYY-MM 형식 (선택, 해당 월 ETA 기준 필터)
   */
  @Get('scheduled')
  @ApiOperation({
    summary: '입고예정 재고',
    description: '통관전 재고와 동일. 입고예정(INBOUND_SCHEDULED) 상태. month(YYYY-MM)로 월 필터 가능',
  })
  async getScheduledInventory(@Query('month') month?: string) {
    let containers = await this.tradeContractsService.listContainers(
      'INBOUND_SCHEDULED',
      false,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      false,
    );
    containers = filterZeroBalesWeight(containers);

    if (!month || !/^\d{4}-\d{2}$/.test(month.trim())) {
      return containers;
    }

    const [year, monthNum] = month.split('-').map(Number);
    const fromTime = new Date(year, monthNum - 1, 1).getTime();
    const toTime = new Date(year, monthNum, 0, 23, 59, 59, 999).getTime();

    return containers.filter((c: { etaDate?: string | null }) => {
      if (!c.etaDate) return false;
      const t = new Date(c.etaDate).getTime();
      return t >= fromTime && t <= toTime;
    });
  }

  /**
   * 전체 재고 (확정·입고예정·입고대기) 한 번에 조회
   * @param month - YYYY-MM 형식 (선택, scheduled·pending에 ETA 월 필터 적용)
   * @param dateFrom - YYYY-MM-DD (선택, dateTo와 함께 사용 시 scheduled·pending에 적용)
   * @param dateTo - YYYY-MM-DD (선택)
   */
  @Get('all')
  @ApiOperation({
    summary: '전체 재고 통합 조회',
    description:
      '확정재고·입고예정·입고대기 재고를 한 번에 조회. confirmed/scheduled는 컨테이너 배열, pending은 주문 배열. month 또는 dateFrom/dateTo는 scheduled·pending에만 적용됨.',
  })
  async getAllInventory(
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const [confirmed, scheduled, pending] = await Promise.all([
      this.getConfirmedInventory(),
      this.getScheduledInventory(month),
      this.getPendingInventory(month, dateFrom, dateTo),
    ]);

    return {
      confirmed,
      scheduled,
      pending,
    };
  }

  /**
   * 입고대기 재고 (입항예정과 동일)
   * @param month - YYYY-MM 형식 (선택, 해당 월 ETA 기준 필터)
   * @param dateFrom - YYYY-MM-DD (선택, dateTo와 함께 사용)
   * @param dateTo - YYYY-MM-DD (선택)
   */
  @Get('pending')
  @ApiOperation({
    summary: '입고대기 재고',
    description: '입항예정과 동일. 입고대기(INBOUND_PENDING) 상태. month 또는 dateFrom/dateTo로 기간 필터',
  })
  async getPendingInventory(
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    let from: string | undefined;
    let to: string | undefined;

    if (month && /^\d{4}-\d{2}$/.test(month.trim())) {
      const [year, monthNum] = month.split('-').map(Number);
      from = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      const lastDay = new Date(year, monthNum, 0).getDate();
      to = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (dateFrom && dateTo) {
      from = dateFrom;
      to = dateTo;
    }

    return this.tradeContractsService.listTradeOrders(
      undefined,
      undefined,
      true, // bookingOnly
      undefined,
      undefined,
      'INBOUND_PENDING',
      undefined,
      undefined,
      undefined,
      undefined,
      'eta',
      from,
      to,
      undefined,
      undefined,
      false,
      undefined,
    );
  }
}
