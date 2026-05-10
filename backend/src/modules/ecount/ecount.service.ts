import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ViewBasicProductDto, EcountProduct, EcountApiResponse } from './dto/view-basic-product.dto';
import { GetZoneDto, ZoneApiResponse } from './dto/zone.dto';
import { LoginDto, LoginApiResponse } from './dto/login.dto';
import { GetDepositTransactionDto, DepositTransaction, DepositTransactionApiResponse } from './dto/deposit-transaction.dto';

@Injectable()
export class EcountService {
  private readonly logger = new Logger(EcountService.name);
  private readonly comCode: string;
  private readonly userId: string;
  private readonly apiCertKey: string;
  private readonly lanType: string;
  private readonly isTest: boolean;
  private cachedZone: string | null = null;
  private cachedSessionId: string | null = null;
  private sessionExpiryTime: number | null = null;

  constructor(private configService: ConfigService) {
    this.comCode = this.configService.get<string>('ECOUNT_COM_CODE') || '';
    this.userId = this.configService.get<string>('ECOUNT_USER_ID') || '';
    this.apiCertKey = this.configService.get<string>('ECOUNT_API_CERT_KEY') || '';
    this.lanType = this.configService.get<string>('ECOUNT_LAN_TYPE') || 'ko-KR';
    this.isTest = this.configService.get<string>('ECOUNT_USE_TEST') === 'true';

    // 디버깅: 환경 변수 로드 상태 확인
    this.logger.log(`[이카운트 설정 확인] COM_CODE: ${this.comCode ? '설정됨' : '미설정'}, USER_ID: ${this.userId ? '설정됨' : '미설정'}, API_CERT_KEY: ${this.apiCertKey ? '설정됨' : '미설정'}, USE_TEST: ${this.isTest ? 'true (sboapi)' : 'false (oapi)'}`);

    if (!this.comCode || !this.userId || !this.apiCertKey) {
      this.logger.warn('이카운트 ERP 인증 정보가 설정되지 않았습니다. (COM_CODE, USER_ID, API_CERT_KEY)');
      this.logger.warn('환경 변수 파일 위치: backend/.env 또는 backend/.env.local 또는 backend/.env.development');
      this.logger.warn('필요한 환경 변수: ECOUNT_COM_CODE, ECOUNT_USER_ID, ECOUNT_API_CERT_KEY');
    }
  }

  /**
   * Zone 정보 조회
   */
  async getZone(): Promise<string> {
    // 캐시된 Zone이 있으면 반환
    if (this.cachedZone) {
      return this.cachedZone;
    }

    if (!this.comCode) {
      throw new BadRequestException('회사코드(COM_CODE)가 설정되지 않았습니다.');
    }

    try {
      const apiPrefix = this.isTest ? 'sboapi' : 'oapi';
      const url = `https://${apiPrefix}.ecount.com/OAPI/V2/Zone`;

      const requestBody = {
        COM_CODE: this.comCode,
      };

      this.logger.log(`[Zone 조회] 환경: ${this.isTest ? '테스트(sboapi)' : '실서버(oapi)'}`);
      this.logger.log(`[Zone 조회] API 호출 - URL: ${url}, COM_CODE: ${this.comCode}`);
      this.logger.log(`[Zone 조회] 요청 본문: ${JSON.stringify(requestBody, null, 2)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`[Zone 조회] HTTP 에러 - Status: ${response.status}`);
        this.logger.error(`[Zone 조회] 전체 응답: ${text}`);
        throw new BadRequestException(`Zone API 호출 실패: HTTP ${response.status}`);
      }

      const responseText = await response.text();
      this.logger.log(`[Zone 조회] 전체 응답: ${responseText}`);

      let data: ZoneApiResponse;
      try {
        data = JSON.parse(responseText);
        this.logger.log(`[Zone 조회] 파싱된 응답 데이터: ${JSON.stringify(data, null, 2)}`);
      } catch (parseError) {
        this.logger.error(`[Zone 조회] JSON 파싱 실패`);
        this.logger.error(`[Zone 조회] 전체 응답: ${responseText}`);
        throw new BadRequestException('Zone API 응답 형식이 올바르지 않습니다.');
      }

      if (data.Error) {
        this.logger.error(`[Zone 조회] API 에러 - Code: ${data.Error.Code}, Message: ${data.Error.Message}`);
        throw new BadRequestException(data.Error.Message || 'Zone 조회에 실패했습니다.');
      }

      if (data.Status !== 200) {
        this.logger.error(`[Zone 조회] Status 에러 - Status: ${data.Status}`);
        throw new BadRequestException(`Zone 조회에 실패했습니다. (Status: ${data.Status})`);
      }

      const zone = data.Data?.ZONE;
      if (!zone) {
        throw new BadRequestException('Zone 정보를 가져올 수 없습니다.');
      }

      this.cachedZone = zone;
      this.logger.log(`[Zone 조회] 성공 - ZONE: ${zone}`);
      return zone;
    } catch (error) {
      this.logger.error('[Zone 조회] 오류 발생', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Zone 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 로그인하여 세션 ID 가져오기
   */
  async login(): Promise<string> {
    // 세션이 유효하면 캐시된 세션 ID 반환 (30분 유효)
    if (this.cachedSessionId && this.sessionExpiryTime && Date.now() < this.sessionExpiryTime) {
      return this.cachedSessionId;
    }

    if (!this.comCode || !this.userId || !this.apiCertKey) {
      throw new BadRequestException('이카운트 ERP 인증 정보가 설정되지 않았습니다. (COM_CODE, USER_ID, API_CERT_KEY)');
    }

    try {
      // Zone 정보 가져오기
      const zone = await this.getZone();

      const apiPrefix = this.isTest ? 'sboapi' : 'oapi';
      const url = `https://${apiPrefix}${zone}.ecount.com/OAPI/V2/OAPILogin`;

      const requestBody: LoginDto = {
        COM_CODE: this.comCode,
        USER_ID: this.userId,
        API_CERT_KEY: this.apiCertKey,
        LAN_TYPE: this.lanType,
        ZONE: zone,
      };

      this.logger.log(`[로그인] 환경: ${this.isTest ? '테스트(sboapi)' : '실서버(oapi)'}`);
      this.logger.log(`[로그인] API 호출 - URL: ${url}, COM_CODE: ${this.comCode}, USER_ID: ${this.userId}`);
      this.logger.log(`[로그인] 요청 본문: ${JSON.stringify({ ...requestBody, API_CERT_KEY: '***' }, null, 2)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`[로그인] HTTP 에러 - Status: ${response.status}`);
        this.logger.error(`[로그인] 전체 응답: ${text}`);
        throw new BadRequestException(`로그인 API 호출 실패: HTTP ${response.status}`);
      }

      const responseText = await response.text();
      this.logger.log(`[로그인] 전체 응답: ${responseText}`);

      let data: LoginApiResponse;
      try {
        data = JSON.parse(responseText);
        this.logger.log(`[로그인] 파싱된 응답 데이터: ${JSON.stringify(data, null, 2)}`);
      } catch (parseError) {
        this.logger.error(`[로그인] JSON 파싱 실패`);
        this.logger.error(`[로그인] 전체 응답: ${responseText}`);
        throw new BadRequestException('로그인 API 응답 형식이 올바르지 않습니다.');
      }

      if (data.Error) {
        this.logger.error(`[로그인] API 에러 - Code: ${data.Error.Code}, Message: ${data.Error.Message}`);
        throw new BadRequestException(data.Error.Message || '로그인에 실패했습니다.');
      }

      if (data.Status !== 200) {
        this.logger.error(`[로그인] Status 에러 - Status: ${data.Status}`);
        throw new BadRequestException(`로그인에 실패했습니다. (Status: ${data.Status})`);
      }

      // Data.Code 확인 (00: 성공, 204: 테스트용 인증키 검증 성공)
      const dataCode = data.Data?.Code;
      
      // Code가 "204"인 경우: 테스트 인증키 검증 성공 (SESSION_ID는 발급되지 않음)
      if (dataCode === '204') {
        const message = data.Data?.Message || '테스트용 인증키입니다.';
        this.logger.log(`[로그인] 테스트 인증키 검증 성공 - ${message}`);
        this.logger.log(`[로그인] 이카운트 인증현황 페이지에서 '검증완료' 상태를 확인하실 수 있습니다.`);
        // 테스트 키는 SESSION_ID를 발급하지 않으므로 빈 문자열 반환 (검증 목적만 달성)
        // 실제 API 호출을 위해서는 실서버용 인증키가 필요합니다.
        return '';
      } else if (dataCode && dataCode !== '00') {
        // Code가 "00" 또는 "204"가 아닌 경우에만 에러
        const message = data.Data?.Message || '로그인에 실패했습니다.';
        this.logger.error(`[로그인] Data.Code 에러 - Code: ${dataCode}, Message: ${message}`);
        throw new BadRequestException(message);
      }

      // SESSION_ID 추출 (실서버용 인증키인 경우)
      let sessionId = data.Data?.Datas?.SESSION_ID;
      
      // Datas가 빈 객체이거나 SESSION_ID가 없는 경우, 다른 경로 확인
      if (!sessionId && data.Data?.Datas) {
        // Datas 객체의 모든 키를 확인
        const datas = data.Data.Datas as any;
        if (datas.SESSION_ID) {
          sessionId = datas.SESSION_ID;
        } else if (datas.session_id) {
          sessionId = datas.session_id;
        }
      }

      if (!sessionId) {
        // Code가 "00"인데 SESSION_ID가 없는 경우는 비정상
        this.logger.error(`[로그인] 세션 ID 없음 - 전체 응답: ${JSON.stringify(data, null, 2)}`);
        throw new BadRequestException(
          `세션 ID를 가져올 수 없습니다. 응답에 SESSION_ID가 포함되어 있지 않습니다. 응답 구조를 확인해주세요. (Code: ${dataCode || '없음'})`,
        );
      }

      // 세션 ID 캐시 (30분 유효)
      this.cachedSessionId = sessionId;
      this.sessionExpiryTime = Date.now() + 30 * 60 * 1000; // 30분

      this.logger.log(`[로그인] 성공 - SESSION_ID: ${sessionId.substring(0, 20)}...`);
      return sessionId;
    } catch (error) {
      this.logger.error('[로그인] 오류 발생', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `로그인 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 이카운트 ERP 품목 조회
   * @param dto 조회 조건
   * @param sessionId 세션 ID (선택, 없으면 자동 로그인)
   */
  async viewBasicProduct(
    dto: ViewBasicProductDto,
    sessionId?: string,
  ): Promise<EcountProduct[]> {
    try {
      // 세션 ID가 없으면 자동 로그인
      let finalSessionId = sessionId;
      if (!finalSessionId) {
        finalSessionId = await this.login();
      }

      // 테스트 인증키로는 세션 ID를 받을 수 없으므로 실제 데이터 조회 불가
      if (!finalSessionId || finalSessionId === '') {
        throw new BadRequestException(
          '테스트 인증키로는 실제 데이터를 조회할 수 없습니다. 이카운트 인증현황 페이지에서 실서버용 인증키를 발급받아 ECOUNT_API_CERT_KEY 환경 변수에 설정해주세요.',
        );
      }

      // Zone 정보 가져오기
      const zone = await this.getZone();

      const apiPrefix = this.isTest ? 'sboapi' : 'oapi';
      const url = `https://${apiPrefix}${zone}.ecount.com/OAPI/V2/InventoryBasic/ViewBasicProduct?SESSION_ID=${encodeURIComponent(finalSessionId)}`;

      // 요청 본문 구성
      const requestBody: any = {};
      if (dto.PROD_CD) {
        requestBody.PROD_CD = dto.PROD_CD;
      }
      if (dto.PROD_TYPE) {
        requestBody.PROD_TYPE = dto.PROD_TYPE;
      }

      this.logger.log(`[품목 조회] 환경: ${this.isTest ? '테스트(sboapi)' : '실서버(oapi)'}`);
      this.logger.log(
        `[품목 조회] API 호출 - URL: ${url.replace(finalSessionId, '***')}, PROD_CD: ${dto.PROD_CD || '전체'}, PROD_TYPE: ${dto.PROD_TYPE || '전체'}`,
      );
      this.logger.log(`[품목 조회] 요청 본문: ${JSON.stringify(requestBody, null, 2)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // 응답 상태 확인
      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`[품목 조회] HTTP 에러 - Status: ${response.status}`);
        this.logger.error(`[품목 조회] 전체 응답: ${text}`);
        throw new BadRequestException(
          `이카운트 API 호출 실패: HTTP ${response.status}`,
        );
      }

      // 응답 파싱
      const responseText = await response.text();
      this.logger.log(`[품목 조회] 전체 응답: ${responseText}`);

      let data: EcountApiResponse;
      try {
        data = JSON.parse(responseText);
        this.logger.log(`[품목 조회] 파싱된 응답 데이터: ${JSON.stringify(data, null, 2)}`);
      } catch (parseError) {
        this.logger.error(`[품목 조회] JSON 파싱 실패`);
        this.logger.error(`[품목 조회] 전체 응답: ${responseText}`);
        throw new BadRequestException(
          '이카운트 API 응답 형식이 올바르지 않습니다.',
        );
      }

      // 에러 확인 (Error 또는 Errors 필드 체크)
      if (data.Error) {
        this.logger.error(
          `[품목 조회] API 에러 - Code: ${data.Error.Code}, Message: ${data.Error.Message}`,
        );
        throw new BadRequestException(
          data.Error.Message || '품목 조회에 실패했습니다.',
        );
      }
      if (data.Errors) {
        this.logger.error(`[품목 조회] API 에러 - Errors: ${JSON.stringify(data.Errors)}`);
        throw new BadRequestException('품목 조회에 실패했습니다.');
      }

      // Status 확인 (문자열 "200" 또는 숫자 200 모두 허용)
      const status = typeof data.Status === 'string' ? parseInt(data.Status, 10) : data.Status;
      if (status !== 200) {
        this.logger.error(`[품목 조회] Status 에러 - Status: ${data.Status} (타입: ${typeof data.Status})`);
        throw new BadRequestException(`품목 조회에 실패했습니다. (Status: ${data.Status})`);
      }

      // 결과 반환
      const products = data.Data?.Result || [];
      this.logger.log(`[품목 조회] 성공 - 조회된 품목 수: ${products.length}`);
      return products;
    } catch (error) {
      this.logger.error('[품목 조회] 오류 발생', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `품목 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 예금/입금 거래 내역 조회 (농협 입금 내역 포함)
   * 
   * ⚠️ 주의: 이 메서드는 실제 이카운트 API 문서를 확인하지 못한 상태에서
   * 일반적인 패턴으로 추정하여 작성된 것입니다.
   * 
   * 실제 사용 전에 반드시:
   * 1. 이카운트 고객센터에 문의하여 입금/예금 거래내역 조회 API 존재 여부 확인
   * 2. 이카운트 API 문서에서 정확한 엔드포인트 확인
   * 3. 필요한 파라미터와 응답 구조 확인
   * 4. 실제 엔드포인트로 코드 수정
   * 
   * 이카운트 고객센터 문의 시 질문:
   * - "농협 입금 내역 자동 갱신 데이터를 Open API로 조회할 수 있나요?"
   * - "입금/예금 거래내역 조회 API 엔드포인트는 무엇인가요?"
   * - "필요한 파라미터와 응답 형식을 알려주세요."
   * 
   * @param dto 조회 조건
   * @param sessionId 세션 ID (선택, 없으면 자동 로그인)
   */
  async getDepositTransactions(
    dto: GetDepositTransactionDto,
    sessionId?: string,
  ): Promise<DepositTransaction[]> {
    try {
      // 세션 ID가 없으면 자동 로그인
      let finalSessionId = sessionId;
      if (!finalSessionId) {
        finalSessionId = await this.login();
      }

      // 테스트 인증키로는 세션 ID를 받을 수 없으므로 실제 데이터 조회 불가
      if (!finalSessionId || finalSessionId === '') {
        throw new BadRequestException(
          '테스트 인증키로는 실제 데이터를 조회할 수 없습니다. 이카운트 인증현황 페이지에서 실서버용 인증키를 발급받아 ECOUNT_API_CERT_KEY 환경 변수에 설정해주세요.',
        );
      }

      // Zone 정보 가져오기
      const zone = await this.getZone();

      const apiPrefix = this.isTest ? 'sboapi' : 'oapi';
      
      // ⚠️ 아래 엔드포인트는 추정값입니다. 실제 이카운트 API 문서에서 확인해야 합니다.
      // 이카운트 고객센터에 문의하여 정확한 엔드포인트를 확인하세요.
      // 
      // 추정 가능한 엔드포인트 예시 (실제와 다를 수 있음):
      // - Account/ViewDepositTransaction
      // - Bank/ViewTransaction
      // - Cash/ViewDeposit
      // - Account/ViewTransaction
      
      // TODO: 이카운트 API 문서에서 정확한 엔드포인트를 확인하여 아래 값을 수정하세요
      const endpoint = 'Account/ViewDepositTransaction'; // ← 실제 엔드포인트로 수정 필요
      const url = `https://${apiPrefix}${zone}.ecount.com/OAPI/V2/${endpoint}?SESSION_ID=${encodeURIComponent(finalSessionId)}`;

      // 요청 본문 구성
      const requestBody: any = {};
      if (dto.ACCOUNT_CD) {
        requestBody.ACCOUNT_CD = dto.ACCOUNT_CD;
      }
      if (dto.START_DATE) {
        requestBody.START_DATE = dto.START_DATE;
      }
      if (dto.END_DATE) {
        requestBody.END_DATE = dto.END_DATE;
      }
      if (dto.TRAN_TYPE) {
        requestBody.TRAN_TYPE = dto.TRAN_TYPE;
      }

      this.logger.log(`[입금 거래내역 조회] 환경: ${this.isTest ? '테스트(sboapi)' : '실서버(oapi)'}`);
      this.logger.log(`[입금 거래내역 조회] API 호출 - URL: ${url.replace(finalSessionId, '***')}`);
      this.logger.log(`[입금 거래내역 조회] 요청 본문: ${JSON.stringify(requestBody, null, 2)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // 응답 상태 확인
      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`[입금 거래내역 조회] HTTP 에러 - Status: ${response.status}`);
        this.logger.error(`[입금 거래내역 조회] 전체 응답: ${text}`);
        throw new BadRequestException(
          `이카운트 API 호출 실패: HTTP ${response.status}`,
        );
      }

      // 응답 파싱
      const responseText = await response.text();
      this.logger.log(`[입금 거래내역 조회] 전체 응답: ${responseText}`);

      let data: DepositTransactionApiResponse;
      try {
        data = JSON.parse(responseText);
        this.logger.log(`[입금 거래내역 조회] 파싱된 응답 데이터: ${JSON.stringify(data, null, 2)}`);
      } catch (parseError) {
        this.logger.error(`[입금 거래내역 조회] JSON 파싱 실패`);
        this.logger.error(`[입금 거래내역 조회] 전체 응답: ${responseText}`);
        throw new BadRequestException(
          '이카운트 API 응답 형식이 올바르지 않습니다.',
        );
      }

      // 에러 확인 (Error 또는 Errors 필드 체크)
      if (data.Error) {
        this.logger.error(
          `[입금 거래내역 조회] API 에러 - Code: ${data.Error.Code}, Message: ${data.Error.Message}`,
        );
        throw new BadRequestException(
          data.Error.Message || '입금 거래내역 조회에 실패했습니다.',
        );
      }
      if (data.Errors) {
        this.logger.error(`[입금 거래내역 조회] API 에러 - Errors: ${JSON.stringify(data.Errors)}`);
        throw new BadRequestException('입금 거래내역 조회에 실패했습니다.');
      }

      // Status 확인 (문자열 "200" 또는 숫자 200 모두 허용)
      const status = typeof data.Status === 'string' ? parseInt(data.Status, 10) : data.Status;
      if (status !== 200) {
        this.logger.error(`[입금 거래내역 조회] Status 에러 - Status: ${data.Status} (타입: ${typeof data.Status})`);
        throw new BadRequestException(`입금 거래내역 조회에 실패했습니다. (Status: ${data.Status})`);
      }

      // 결과 반환
      const transactions = data.Data?.Result || [];
      this.logger.log(`[입금 거래내역 조회] 성공 - 조회된 거래 내역 수: ${transactions.length}`);
      return transactions;
    } catch (error) {
      this.logger.error('[입금 거래내역 조회] 오류 발생', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `입금 거래내역 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
