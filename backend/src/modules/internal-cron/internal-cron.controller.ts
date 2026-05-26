import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CronSecretGuard } from '../auth/guards/cron-secret.guard';
import { TradeContractsService } from '../trade-contracts/trade-contracts.service';

@ApiTags('Internal Cron')
@ApiHeader({
  name: 'X-Cron-Secret',
  description: 'Cloud Scheduler용 시크릿 (CRON_SECRET 환경변수와 동일)',
  required: true,
})
@Controller('internal/cron')
@UseGuards(CronSecretGuard)
export class InternalCronController {
  constructor(private readonly tradeContractsService: TradeContractsService) {}

  /**
   * 물류관리 「ETA 정보 갱신」과 동일한 선적 조회·DB 반영.
   * 대상: 부킹 목록, 상태 BOOKING·DOCUMENTS·DO, 물류 제외 주문 제외, BK/BL 있는 건만.
   */
  @Post('eta-update')
  @ApiOperation({ summary: 'ETA 일괄 갱신 (스케줄러)' })
  runScheduledEtaUpdate() {
    return this.tradeContractsService.runScheduledEtaUpdate();
  }
}
