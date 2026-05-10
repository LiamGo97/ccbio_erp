import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { CustomersService } from '../customers/customers.service';
import { ExternalCustomerSyncDto } from '../customers/dto/external-customer-sync.dto';

/**
 * 이커머스 몰 → ERP 고객 동기화 (회원가입 후 비동기 호출)
 */
@ApiTags('External API (고객)')
@ApiHeader({
  name: 'X-API-Key',
  description: '외부 API 인증 키 (EXTERNAL_API_KEY 환경변수와 일치)',
  required: true,
})
@Controller('external/customers')
@UseGuards(ApiKeyGuard)
export class ExternalCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('sync')
  @ApiOperation({
    summary: '몰 회원 → ERP 고객 동기화',
    description:
      'mallUserId·이름 필수. 기존 고객은 mallUserId → 사업자번호 → 휴대전화 순 매칭 후 갱신, 없으면 생성. 법정동코드 legalBCode(선택, 10자리 숫자) → cu_legal_b_code. 신규 참참(Chamcharm)은 chamcharmMemberStatus 생략 시 ERP가 CHAMCHARM_MEMBER_STATUS 기본 참참회원으로 자동 설정. 구(레거시) 참참바이오(cu_chamcham_status)는 이 API로 설정하지 않음. email 등은 수신만 하고 tb_customer에 저장하지 않음. 상세: docs/EXTERNAL_API.md',
  })
  async sync(@Body() body: ExternalCustomerSyncDto): Promise<{ customerId: string }> {
    return this.customersService.syncExternalMallCustomer(body);
  }
}
