import { Controller, Get, Post, Body, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EcountService } from './ecount.service';
import { ViewBasicProductDto } from './dto/view-basic-product.dto';
import { GetDepositTransactionDto } from './dto/deposit-transaction.dto';

@Controller('ecount')
@UseGuards(JwtAuthGuard)
export class EcountController {
  private readonly logger = new Logger(EcountController.name);

  constructor(private readonly ecountService: EcountService) {}

  /**
   * Zone 정보 조회
   */
  @Get('zone')
  async getZone() {
    this.logger.log('[Zone 조회 요청]');
    try {
      const zone = await this.ecountService.getZone();
      return {
        success: true,
        zone,
      };
    } catch (error) {
      this.logger.error(`[Zone 조회 실패] ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 로그인하여 세션 ID 가져오기
   */
  @Post('login')
  async login() {
    this.logger.log('[로그인 요청]');
    try {
      const sessionId = await this.ecountService.login();
      return {
        success: true,
        sessionId,
      };
    } catch (error) {
      this.logger.error(`[로그인 실패] ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 품목 조회
   */
  @Post('products')
  async viewBasicProduct(@Body() dto: ViewBasicProductDto) {
    this.logger.log(
      `[품목 조회 요청] PROD_CD: ${dto.PROD_CD || '전체'}, PROD_TYPE: ${dto.PROD_TYPE || '전체'}`,
    );

    try {
      const result = await this.ecountService.viewBasicProduct(dto);
      this.logger.log(`[품목 조회 완료] 조회된 품목 수: ${result.length}`);
      return {
        success: true,
        data: result,
        count: result.length,
      };
    } catch (error) {
      this.logger.error(
        `[품목 조회 실패] ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 품목 조회 (GET 방식 - 쿼리 파라미터로)
   */
  @Get('products')
  async viewBasicProductGet(
    @Query('prodCd') prodCd?: string,
    @Query('prodType') prodType?: string,
  ) {
    const dto: ViewBasicProductDto = {};
    if (prodCd) {
      dto.PROD_CD = prodCd;
    }
    if (prodType) {
      dto.PROD_TYPE = prodType;
    }

    this.logger.log(
      `[품목 조회 요청] PROD_CD: ${dto.PROD_CD || '전체'}, PROD_TYPE: ${dto.PROD_TYPE || '전체'}`,
    );

    try {
      const result = await this.ecountService.viewBasicProduct(dto);
      this.logger.log(`[품목 조회 완료] 조회된 품목 수: ${result.length}`);
      return {
        success: true,
        data: result,
        count: result.length,
      };
    } catch (error) {
      this.logger.error(
        `[품목 조회 실패] ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 예금/입금 거래 내역 조회 (농협 입금 내역 포함)
   * 
   * ⚠️ 주의: 이 API는 실제 이카운트 API 문서를 확인하지 못한 상태에서
   * 추정으로 작성된 코드입니다. 실제 사용 전에 반드시 이카운트 고객센터에
   * 문의하여 API 존재 여부와 정확한 엔드포인트를 확인하세요.
   */
  @Post('deposit-transactions')
  async getDepositTransactions(@Body() dto: GetDepositTransactionDto) {
    this.logger.log(
      `[입금 거래내역 조회 요청] ACCOUNT_CD: ${dto.ACCOUNT_CD || '전체'}, START_DATE: ${dto.START_DATE || '없음'}, END_DATE: ${dto.END_DATE || '없음'}`,
    );

    try {
      const result = await this.ecountService.getDepositTransactions(dto);
      this.logger.log(`[입금 거래내역 조회 완료] 조회된 거래 내역 수: ${result.length}`);
      return {
        success: true,
        data: result,
        count: result.length,
      };
    } catch (error) {
      this.logger.error(
        `[입금 거래내역 조회 실패] ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 예금/입금 거래 내역 조회 (GET 방식 - 쿼리 파라미터로)
   */
  @Get('deposit-transactions')
  async getDepositTransactionsGet(
    @Query('accountCd') accountCd?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('tranType') tranType?: string,
  ) {
    const dto: GetDepositTransactionDto = {};
    if (accountCd) {
      dto.ACCOUNT_CD = accountCd;
    }
    if (startDate) {
      dto.START_DATE = startDate;
    }
    if (endDate) {
      dto.END_DATE = endDate;
    }
    if (tranType) {
      dto.TRAN_TYPE = tranType;
    }

    this.logger.log(
      `[입금 거래내역 조회 요청] ACCOUNT_CD: ${dto.ACCOUNT_CD || '전체'}, START_DATE: ${dto.START_DATE || '없음'}, END_DATE: ${dto.END_DATE || '없음'}`,
    );

    try {
      const result = await this.ecountService.getDepositTransactions(dto);
      this.logger.log(`[입금 거래내역 조회 완료] 조회된 거래 내역 수: ${result.length}`);
      return {
        success: true,
        data: result,
        count: result.length,
      };
    } catch (error) {
      this.logger.error(
        `[입금 거래내역 조회 실패] ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

