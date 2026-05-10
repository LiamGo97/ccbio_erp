import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const KOREAEXIM_API_URL = 'https://www.koreaexim.go.kr/site/program/financial/exchangeJSON';

interface ExchangeRateItem {
  [key: string]: string | number;
}

export interface ExchangeRateResponse {
  date: string;
  rates: Record<string, number>;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('KOREAEXIM_API_KEY') || 'fMGkc6ILxXhHNEG3qaW9KLaTpF4jRQuv';
  }

  /**
   * 날짜를 YYYYMMDD 형식으로 변환
   */
  private formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * 한국수출입은행 API 호출
   */
  private async callKoreaEximAPI(dateString: string): Promise<ExchangeRateItem[]> {
    const fetchFn = (globalThis as unknown as { fetch?: (input: string, init?: unknown) => Promise<any> }).fetch;

    if (typeof fetchFn !== 'function') {
      this.logger.error('현재 Node.js 환경에서 fetch API를 사용할 수 없습니다.');
      throw new BadRequestException('서버에서 환율 API를 호출할 수 없는 환경입니다.');
    }

    const url = new URL(KOREAEXIM_API_URL);
    url.searchParams.set('authkey', this.apiKey);
    url.searchParams.set('searchdate', dateString);
    url.searchParams.set('data', 'AP01');

    const fullUrl = url.toString();
    this.logger.log(`한국수출입은행 API 호출 - URL: ${fullUrl.replace(this.apiKey, '***')}`);

    let response: any;
    let lastError: Error | null = null;
    const maxRetries = 3;
    const retryDelay = 1000; // 1초
    const timeout = 10000; // 10초 타임아웃

    // 재시도 로직
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 타임아웃을 위한 AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          // Node.js 환경에서 더 안정적인 fetch 호출
          const fetchOptions: any = {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://www.koreaexim.go.kr/',
              'Origin': 'https://www.koreaexim.go.kr',
            },
            signal: controller.signal,
          };
          
          // Node.js 18+에서는 keepalive 옵션 지원
          if (typeof process !== 'undefined' && process.versions?.node) {
            fetchOptions.keepalive = true;
          }
          
          response = await fetchFn(fullUrl, fetchOptions);
          
          clearTimeout(timeoutId);
          // 성공하면 루프 종료
          lastError = null;
          break;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;
        const errorStack = lastError.stack;
        const errorName = lastError.name;
        
        // 더 자세한 에러 정보 로깅
        this.logger.warn(
          `한국수출입은행 API 호출 시도 ${attempt}/${maxRetries} 실패 - 날짜: ${dateString}, 오류: ${errorName}: ${errorMessage}`,
        );
        
        if (errorStack) {
          this.logger.debug(`에러 스택: ${errorStack.slice(0, 500)}`);
        }
        
        // 마지막 시도가 아니면 대기 후 재시도
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
          continue;
        }
        
        // 모든 시도 실패
        this.logger.error(
          `한국수출입은행 API 호출 중 네트워크 오류가 발생했습니다. 날짜: ${dateString}, 오류: ${errorName}: ${errorMessage}`,
          lastError,
        );
        
        // 네트워크 오류인 경우 더 친절한 메시지 제공
        if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
          throw new BadRequestException(
            `환율 API 서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요. (오류: ${errorMessage})`
          );
        }
        
        throw new BadRequestException(`환율 API 호출 중 오류가 발생했습니다: ${errorMessage}`);
      }
    }

    if (!response) {
      throw new BadRequestException('환율 API로부터 응답을 받지 못했습니다.');
    }

    const status = response.status ?? 0;
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      this.logger.error(`환율 API 응답 읽기 실패 - status: ${status}`, error as Error);
      throw new BadRequestException('환율 API 응답을 읽는 중 오류가 발생했습니다.');
    }

    if (status >= 400) {
      this.logger.warn(`환율 API 오류 응답 - status: ${status}, date: ${dateString}, body: ${text?.slice(0, 500) ?? ''}`);
      throw new BadRequestException(`환율 API 호출이 실패했습니다. (상태 코드: ${status})`);
    }

    try {
      const parsed = text ? JSON.parse(text) : [];
      
      // 에러 메시지가 있는지 확인
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const errorMsg = (parsed as any).message || (parsed as any).error || (parsed as any).result;
        if (errorMsg) {
          this.logger.warn(`환율 API 에러 응답 - 날짜: ${dateString}, 메시지: ${errorMsg}`);
          return [];
        }
      }
      
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed[0] === null) {
        // 날짜가 주말/공휴일인지 확인
        const dateObj = new Date(
          parseInt(dateString.substring(0, 4)),
          parseInt(dateString.substring(4, 6)) - 1,
          parseInt(dateString.substring(6, 8))
        );
        const dayOfWeek = dateObj.getDay(); // 0 = 일요일, 6 = 토요일
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          this.logger.warn(`환율 데이터가 없습니다. 날짜: ${dateString} (주말입니다)`);
        } else {
          this.logger.warn(`환율 데이터가 없습니다. 날짜: ${dateString}, 응답: ${text?.slice(0, 200) ?? ''}`);
        }
        return [];
      }
      return parsed as ExchangeRateItem[];
    } catch (error) {
      this.logger.error(`환율 API 응답 파싱 중 오류가 발생했습니다. 응답: ${text?.slice(0, 200) ?? ''}`, error as Error);
      throw new BadRequestException('환율 API 응답을 해석하는 중 오류가 발생했습니다.');
    }
  }

  /**
   * 날짜가 주말인지 확인
   */
  private isWeekend(dateString: string): boolean {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay(); // 0 = 일요일, 6 = 토요일
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  /**
   * 가장 최근에 환율 데이터가 있는 날짜 찾기 (최대 7일 전까지)
   * 주말이나 공휴일인 경우 실제로 데이터가 있는 날짜를 찾음
   */
  private async getPreviousAvailableDate(dateString: string): Promise<string | null> {
    const year = parseInt(dateString.substring(0, 4));
    const month = parseInt(dateString.substring(4, 6)) - 1;
    const day = parseInt(dateString.substring(6, 8));
    let dateObj = new Date(year, month, day);
    
    // 최대 7일 전까지 확인
    for (let i = 1; i <= 7; i++) {
      dateObj.setDate(dateObj.getDate() - 1);
      const checkDateString = this.formatDate(dateObj);
      
      // 실제로 API를 호출해서 데이터가 있는지 확인
      try {
        const data = await this.callKoreaEximAPI(checkDateString);
        if (data && data.length > 0) {
          // 데이터가 있으면 해당 날짜 반환
          return checkDateString;
        }
      } catch (error) {
        // API 호출 실패 시 다음 날짜 확인
        continue;
      }
    }
    return null;
  }

  /**
   * 특정 날짜의 환율 조회
   * @param date 날짜 (Date 객체 또는 YYYY-MM-DD 형식 문자열)
   * @param currencyCode 통화 코드 (예: USD, EUR, JPY 등). 없으면 USD 기본값
   * @returns 환율 값 (KRW 기준)
   */
  async getExchangeRate(date: Date | string, currencyCode: string = 'USD'): Promise<number | null> {
    const dateString = this.formatDate(date);
    this.logger.log(`환율 조회 요청 - 날짜: ${dateString}, 통화: ${currencyCode}`);

    try {
      let data = await this.callKoreaEximAPI(dateString);
      let actualDate = dateString;

      // 데이터가 없으면 (주말이거나 공휴일) 최근에 환율 데이터가 있는 날짜 조회
      if (!data || data.length === 0) {
        if (this.isWeekend(dateString)) {
          this.logger.log(`주말이므로 최근에 환율 데이터가 있는 날짜 조회 - 요청 날짜: ${dateString}`);
        } else {
          this.logger.log(`공휴일이거나 데이터가 없으므로 최근에 환율 데이터가 있는 날짜 조회 - 요청 날짜: ${dateString}`);
        }
        
        const previousAvailableDate = await this.getPreviousAvailableDate(dateString);
        if (previousAvailableDate) {
          this.logger.log(`최근 환율 데이터 발견 - 날짜: ${previousAvailableDate}`);
          data = await this.callKoreaEximAPI(previousAvailableDate);
          actualDate = previousAvailableDate;
        }
      }

      if (!data || data.length === 0) {
        this.logger.warn(`환율 데이터가 없습니다. 날짜: ${dateString}`);
        return null;
      }

      // 통화 코드로 환율 찾기 (대소문자 무시)
      const currencyUpper = currencyCode.toUpperCase();
      const rateItem = data.find((item) => {
        const code = String(item.cur_unit || item.curUnit || '').toUpperCase();
        return code === currencyUpper || code === `${currencyUpper} ` || code.startsWith(currencyUpper);
      });

      if (!rateItem) {
        this.logger.warn(`통화 코드를 찾을 수 없습니다. 날짜: ${dateString}, 통화: ${currencyCode}`);
        return null;
      }

      // 환율 값 추출 (배열의 9번째 인덱스 또는 ttb/tts 필드)
      // Google Apps Script 코드에서 arr[i][9]를 사용했으므로, 객체의 값 배열에서 9번째를 가져옴
      const values = Object.values(rateItem);
      const rateValue = values[9] || rateItem.ttb || rateItem.tts || rateItem.deal_bas_r || rateItem.dealBasR;

      if (!rateValue) {
        this.logger.warn(`환율 값을 찾을 수 없습니다. 날짜: ${dateString}, 통화: ${currencyCode}`);
        return null;
      }

      // 문자열인 경우 콤마 제거 후 숫자로 변환
      const rate = typeof rateValue === 'string' ? parseFloat(rateValue.replace(/,/g, '')) : Number(rateValue);

      if (isNaN(rate) || rate <= 0) {
        this.logger.warn(`유효하지 않은 환율 값입니다. 날짜: ${dateString}, 통화: ${currencyCode}, 값: ${rateValue}`);
        return null;
      }

      this.logger.log(`환율 조회 성공 - 날짜: ${dateString}, 통화: ${currencyCode}, 환율: ${rate}`);
      return rate;
    } catch (error) {
      this.logger.error(`환율 조회 중 오류 발생 - 날짜: ${dateString}, 통화: ${currencyCode}`, error as Error);
      throw error;
    }
  }

  /**
   * 특정 날짜의 모든 환율 조회
   */
  async getAllExchangeRates(date: Date | string): Promise<ExchangeRateResponse | null> {
    const dateString = this.formatDate(date);
    this.logger.log(`모든 환율 조회 요청 - 날짜: ${dateString}`);

    try {
      let data = await this.callKoreaEximAPI(dateString);
      let actualDate = dateString;

      // 데이터가 없으면 (주말이거나 공휴일) 최근에 환율 데이터가 있는 날짜 조회
      if (!data || data.length === 0) {
        if (this.isWeekend(dateString)) {
          this.logger.log(`주말이므로 최근에 환율 데이터가 있는 날짜 조회 - 요청 날짜: ${dateString}`);
        } else {
          this.logger.log(`공휴일이거나 데이터가 없으므로 최근에 환율 데이터가 있는 날짜 조회 - 요청 날짜: ${dateString}`);
        }
        
        const previousAvailableDate = await this.getPreviousAvailableDate(dateString);
        if (previousAvailableDate) {
          this.logger.log(`최근 환율 데이터 발견 - 날짜: ${previousAvailableDate}`);
          data = await this.callKoreaEximAPI(previousAvailableDate);
          actualDate = previousAvailableDate;
        }
      }

      if (!data || data.length === 0) {
        this.logger.warn(`환율 데이터가 없습니다. 날짜: ${dateString}`);
        return null;
      }

      const rates: Record<string, number> = {};

      data.forEach((item) => {
        const currencyCode = String(item.cur_unit || item.curUnit || '').trim().toUpperCase();
        if (!currencyCode) return;

        const values = Object.values(item);
        const rateValue = values[9] || item.ttb || item.tts || item.deal_bas_r || item.dealBasR;

        if (rateValue) {
          const rate = typeof rateValue === 'string' ? parseFloat(rateValue.replace(/,/g, '')) : Number(rateValue);
          if (!isNaN(rate) && rate > 0) {
            rates[currencyCode] = rate;
          }
        }
      });

      return {
        date: actualDate, // 실제 조회된 날짜 반환
        rates,
      };
    } catch (error) {
      this.logger.error(`모든 환율 조회 중 오류 발생 - 날짜: ${dateString}`, error as Error);
      throw error;
    }
  }
}

