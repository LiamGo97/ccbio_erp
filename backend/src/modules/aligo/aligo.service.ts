import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendSmsDto } from './dto/send-sms.dto';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { GetSmsListDto } from './dto/get-sms-list.dto';
import { GetSmsDetailDto } from './dto/get-sms-detail.dto';
import { StorageService } from '../storage/storage.service';
import { SmsHistoryService } from '../sms-history/sms-history.service';
import {
  compressImageForMms,
  MMS_IMAGE_TARGET_SIZE_KB,
} from '../../common/utils/mms-image-normalize';
import FormDataModule = require('form-data');
import axios from 'axios';

type AligoFormData = InstanceType<typeof FormDataModule>;

@Injectable()
export class AligoService {
  private readonly logger = new Logger(AligoService.name);
  private readonly apiKey: string;
  private readonly userId: string;
  private readonly sender: string;
  // 직접 알리고 API 사용 (기본값)
  // ALIGO_USE_PROXY=true로 설정하면 프록시 서버 사용
  private readonly useProxy = process.env.ALIGO_USE_PROXY === 'true';
  private readonly proxyUrl = process.env.ALIGO_PROXY_URL || 'http://34.64.60.50:3000';
  private readonly directApiUrl = 'https://apis.aligo.in';
  private readonly baseUrl = this.useProxy ? this.proxyUrl : this.directApiUrl;

  constructor(
    private configService: ConfigService,
    private storageService: StorageService,
    private smsHistoryService: SmsHistoryService,
  ) {
    this.apiKey = this.configService.get<string>('ALIGO_API_KEY') || '';
    this.userId = this.configService.get<string>('ALIGO_USER_ID') || '';
    this.sender = this.configService.get<string>('ALIGO_SENDER') || '';

    if (!this.apiKey || !this.userId) {
      this.logger.warn('알리고 API 키 또는 User ID가 설정되지 않았습니다.');
    }
  }

  /**
   * 잔액 조회
   */
  async getBalance(): Promise<BalanceResponseDto> {
    if (!this.apiKey || !this.userId) {
      throw new BadRequestException('알리고 API 설정이 완료되지 않았습니다.');
    }

    try {
      // 잔액 조회 URL (프록시 서버 또는 직접 알리고 API)
      const url = `${this.baseUrl}/remain/`;
      const formData = new URLSearchParams();
      formData.append('key', this.apiKey);
      formData.append('user_id', this.userId);

      this.logger.log(`[잔액 조회] API 호출 - URL: ${url}, user_id: ${this.userId}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      // 응답 상태 확인
      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`[잔액 조회] HTTP 에러 - Status: ${response.status}, Response: ${text.substring(0, 200)}`);
        throw new BadRequestException(`알리고 API 호출 실패: HTTP ${response.status}`);
      }

      // 응답 텍스트로 먼저 확인
      const responseText = await response.text();
      this.logger.log(`[잔액 조회] 응답 텍스트: ${responseText.substring(0, 200)}`);

      // JSON 파싱 시도
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        this.logger.error(`[잔액 조회] JSON 파싱 실패 - 응답: ${responseText.substring(0, 500)}`);
        throw new BadRequestException('알리고 API 응답 형식이 올바르지 않습니다. HTML 응답이 반환되었을 수 있습니다.');
      }

      // 응답 코드 확인
      // 알리고 API는 result_code: 1이 성공 (프록시 서버와 동일)
      const isSuccess = data.result_code === 1 || data.result_code === '1' || data.result_code === 0 || data.result_code === '0';
      
      if (!isSuccess) {
        this.logger.error(`[잔액 조회] API 에러 - result_code: ${data.result_code}, message: ${data.message}`);
        
        // IP 인증 오류인 경우 특별 처리
        if (data.result_code === -101 || data.message?.includes('IP')) {
          throw new BadRequestException('IP 인증 오류입니다. 알리고 관리자 페이지에서 서버 IP를 화이트리스트에 추가해주세요.');
        }
        
        throw new BadRequestException(data.message || `잔액 조회에 실패했습니다. (코드: ${data.result_code})`);
      }

      return data;
    } catch (error) {
      this.logger.error('[잔액 조회] 오류 발생', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`잔액 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * GCS URL이면 다운로드·압축 후 multipart에 추가, 아니면 URL 문자열로 전달(알리고 호환).
   * @returns 바이너리로 붙인 경우 해당 바이트 수(요청 크기 추정용), URL만 붙이면 0
   */
  private async appendMmsImageFromUrl(
    formData: AligoFormData,
    fieldName: 'image' | 'image2',
    imageUrl: string,
  ): Promise<number> {
    const urlPattern = /https:\/\/storage\.googleapis\.com\/[^/]+\/(.+)/;
    const match = imageUrl.match(urlPattern);
    if (!match?.[1]) {
      formData.append(fieldName, imageUrl);
      this.logger.log(`[SMS 발송] MMS ${fieldName} URL 문자열 추가: ${imageUrl}`);
      return 0;
    }
    const filePath = match[1];
    try {
      let imageBuffer = await this.storageService.downloadFile(filePath);
      const originalSizeKB = Math.round(imageBuffer.length / 1024);
      this.logger.log(
        `[SMS 발송] ${fieldName} GCS 다운로드: ${originalSizeKB} KB (path: ${filePath})`,
      );
      const maxBytes = MMS_IMAGE_TARGET_SIZE_KB * 1024;
      if (imageBuffer.length > maxBytes) {
        imageBuffer = await compressImageForMms(imageBuffer, MMS_IMAGE_TARGET_SIZE_KB);
        this.logger.log(
          `[SMS 발송] ${fieldName} 압축 후: ${Math.round(imageBuffer.length / 1024)} KB`,
        );
        if (imageBuffer.length > maxBytes) {
          this.logger.warn(
            `[SMS 발송] ${fieldName} 압축 후에도 ${MMS_IMAGE_TARGET_SIZE_KB}KB 초과 가능성`,
          );
        }
      }
      const baseName = filePath.split('/').pop() || 'image.jpg';
      const finalFileName = baseName.replace(/\.(png|jpeg|jpg|gif|webp)$/i, '.jpg');
      formData.append(fieldName, imageBuffer, {
        filename: finalFileName,
        contentType: 'image/jpeg',
      });
      this.logger.log(
        `[SMS 발송] MMS ${fieldName} 파일 첨부: ${finalFileName} (${Math.round(imageBuffer.length / 1024)} KB)`,
      );
      return imageBuffer.length;
    } catch (error) {
      this.logger.error(
        `[SMS 발송] ${fieldName} GCS 처리 실패, URL로 대체: ${error instanceof Error ? error.message : String(error)}`,
      );
      formData.append(fieldName, imageUrl);
      return 0;
    }
  }

  /**
   * SMS 발송 (이미지 첨부 시 MMS로 자동 전환)
   */
  async sendSms(dto: SendSmsDto): Promise<any> {
    if (!this.apiKey || !this.userId) {
      throw new BadRequestException('알리고 API 설정이 완료되지 않았습니다.');
    }

    if (!dto.recipients || dto.recipients.length === 0) {
      throw new BadRequestException('수신자가 없습니다.');
    }

    if (dto.imageUrl2?.trim() && !dto.imageUrl?.trim()) {
      throw new BadRequestException(
        'MMS 두 번째 이미지(image2)는 첫 번째 이미지(image)와 함께 보내야 합니다.',
      );
    }

    try {
      const sender = dto.sender || this.sender;
      const messageLength = dto.message?.length || 0;
      const hasImage = !!dto.imageUrl?.trim();
      
      this.logger.log(`[SMS 발송 시작] 수신자 수: ${dto.recipients.length}, 메시지 길이: ${messageLength}, 이미지 포함: ${hasImage}, 발신번호: ${sender || '기본값'}`);
      
      // 메시지 타입 결정:
      // - 이미지가 있으면 MMS
      // - 이미지가 없고 90자 이하면 SMS
      // - 이미지가 없고 91-2000자면 LMS
      const isMms = hasImage;
      const isLms = !hasImage && messageLength > 90 && messageLength <= 2000;
      const isSms = !hasImage && messageLength <= 90;
      
      const messageType = isMms ? 'MMS' : (isLms ? 'LMS' : 'SMS');
      this.logger.log(`[SMS 발송] 메시지 타입 결정: ${messageType} (SMS: ${isSms}, LMS: ${isLms}, MMS: ${isMms})`);
      
      // 메시지 길이 검증
      if (messageLength > 2000) {
        throw new BadRequestException('메시지는 2000자를 초과할 수 없습니다.');
      }
      
      // 프록시 사용 여부 (testmode_yn 설정용)
      const isProxyServer = this.useProxy;
      
      // 목록/잔액과 동일 도메인(apis.aligo.in)으로 발송 강제
      const urlBase = this.directApiUrl;
      this.logger.log(`[SMS 발송] 도메인 고정: ${urlBase} (목록/잔액과 동일)`);
      
      // SMS/LMS/MMS 발송 URL (알리고 공식 /send/ 단일 엔드포인트)
      const url = `${urlBase}/send/`;
      this.logger.log(`[SMS 발송] API URL: ${url}`);

      // 여러 수신자에게 발송
      const results = [];
      for (let i = 0; i < dto.recipients.length; i++) {
        const recipient = dto.recipients[i];
        this.logger.log(`[SMS 발송] ${i + 1}/${dto.recipients.length} 수신자 처리 중: ${recipient.phone}${recipient.name ? ` (${recipient.name})` : ''}`);
        
        // 알리고 API는 multipart/form-data 형식으로 이미지 파일을 직접 전송해야 함
        const formData = new FormDataModule();
        
        // API 키와 사용자 ID 확인 및 로깅
        this.logger.log(`[SMS 발송] API 키 확인: ${this.apiKey ? '설정됨 (' + this.apiKey.substring(0, 4) + '...)' : '미설정'}, User ID: ${this.userId || '미설정'}`);
        
        formData.append('key', String(this.apiKey || ''));
        formData.append('user_id', String(this.userId || ''));
        formData.append('sender', String(sender || ''));
        formData.append('receiver', String(recipient.phone || ''));
        formData.append('msg', String(dto.message || ''));
        
        // 프록시 서버 사용 시 testmode_yn 추가
        if (isProxyServer) {
          formData.append('testmode_yn', 'N');
        }

        // MMS: 알리고 스펙 — image(또는 image1), image2, image3 지원
        let totalMmsImageBytes = 0;
        if (isMms && dto.imageUrl?.trim()) {
          try {
            totalMmsImageBytes += await this.appendMmsImageFromUrl(
              formData,
              'image',
              dto.imageUrl.trim(),
            );
            if (dto.imageUrl2?.trim()) {
              totalMmsImageBytes += await this.appendMmsImageFromUrl(
                formData,
                'image2',
                dto.imageUrl2.trim(),
              );
            }
          } catch (error) {
            this.logger.error(`[SMS 발송] MMS 이미지 처리 실패: ${error}`);
            formData.append('image', dto.imageUrl.trim());
            if (dto.imageUrl2?.trim()) {
              formData.append('image2', dto.imageUrl2.trim());
            }
          }
        }
        // 알리고 API는 자동으로 타입을 판단:
        // - image 필드가 있으면 → MMS (그림 문자)
        // - image가 없고 90자 이하 → SMS (단문)
        // - image가 없고 91-2000자 → LMS (장문)
        // 따라서 msg_type 파라미터는 불필요함 (공식 예제 참고)

        const finalImageSizeBytes = totalMmsImageBytes;
        const finalImageSizeKB = Math.round(finalImageSizeBytes / 1024);
        
        // 다른 필드들의 대략적인 크기 계산
        const otherFieldsSize = 
          (this.apiKey?.length || 0) +
          (this.userId?.length || 0) +
          (sender?.length || 0) +
          (recipient.phone?.length || 0) +
          (dto.message?.length || 0) +
          (isMms ? 'MMS'.length : 0) +
          500; // multipart boundary, 헤더 등 오버헤드 추정값
        
        const estimatedTotalSize = finalImageSizeBytes + otherFieldsSize;
        const estimatedTotalSizeKB = Math.round(estimatedTotalSize / 1024);
        
        this.logger.log(`[SMS 발송] 요청 데이터: sender=${sender}, receiver=${recipient.phone}, msg_length=${dto.message.length}, type=${messageType}`);
        if (isMms && finalImageSizeBytes > 0) {
          this.logger.log(`[SMS 발송] 예상 전체 요청 크기: 약 ${estimatedTotalSizeKB} KB (${estimatedTotalSize} bytes) - 이미지: ${finalImageSizeKB} KB, 다른 필드+오버헤드: 약 ${Math.round(otherFieldsSize / 1024)} KB`);
        }
        
        // FormData 헤더 확인
        const headers = formData.getHeaders();
        this.logger.log(`[SMS 발송] FormData 헤더: ${JSON.stringify(headers)}`);
        this.logger.log(`[SMS 발송] FormData 필드 확인 - key: ${this.apiKey ? '설정됨' : '미설정'}, user_id: ${this.userId ? '설정됨' : '미설정'}`);
        
        // 공식 예제와 동일하게 axios 사용 (ReadableStream 변환 문제 해결)
        this.logger.log(`[SMS 발송] axios로 요청 전송 중...`);
        const response = await axios.post(url, formData, {
          headers: headers,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        
        this.logger.log(`[SMS 발송] axios 요청 완료, 응답 상태: ${response.status}`);
        
        // axios는 자동으로 응답 데이터를 파싱
        const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        this.logger.log(`[SMS 발송] 응답 텍스트 (${recipient.phone}): ${responseText.substring(0, 500)}`);
        
        let data = response.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (parseError) {
            this.logger.error(`[SMS 발송] JSON 파싱 실패 (${recipient.phone}) - 응답: ${responseText.substring(0, 500)}`);
            throw new BadRequestException('알리고 API 응답 형식이 올바르지 않습니다.');
          }
        }
        
        this.logger.log(`[SMS 발송] 응답 파싱 성공 (${recipient.phone}): result_code=${data.result_code}, message=${data.message}`);
        
        // 성공 여부 확인
        const isSuccess = data.result_code === 1 || data.result_code === '1' || data.result_code === 0 || data.result_code === '0';
        if (isSuccess) {
          this.logger.log(`[SMS 발송] 성공 (${recipient.phone}): ${messageType} 발송 완료`);
        } else {
          this.logger.warn(`[SMS 발송] 실패 (${recipient.phone}): result_code=${data.result_code}, message=${data.message}`);
        }
        
        results.push({
          phone: recipient.phone,
          name: recipient.name,
          type: messageType,
          result: data,
        });
      }

      // 실제 발송된 메시지 타입 (루프 전 결정한 messageType을 재사용)
      const finalMessageType = messageType;
      
      const successCount = results.filter(r => {
        const code = r.result?.result_code;
        return code === 1 || code === '1' || code === 0 || code === '0';
      }).length;
      const failCount = results.length - successCount;
      
      this.logger.log(`[SMS 발송 완료] 총 ${results.length}건 중 성공: ${successCount}건, 실패: ${failCount}건, 타입: ${finalMessageType}`);

      // SMS 이력 저장 (각 수신자별로 저장)
      try {
        const sender = dto.sender || this.sender;
        for (const result of results) {
          const recipient = dto.recipients.find(r => r.phone === result.phone);
          const isSuccess = result.result?.result_code === 1 || result.result?.result_code === '1' || 
                           result.result?.result_code === 0 || result.result?.result_code === '0';
          
          // 알리고 API 상태 코드를 우리 시스템 상태 코드로 변환
          let status = 'PENDING'; // 기본값
          if (isSuccess) {
            status = 'SENT';
          } else if (result.result?.result_code) {
            status = 'FAILED';
          }

          await this.smsHistoryService.create({
            templateId: dto.templateId,
            templateType: dto.templateType || 'GENERAL',
            templateContent: dto.templateContent,
            recipientPhone: result.phone,
            recipientName: recipient?.name || result.name || null,
            senderPhone: sender,
            senderUserId: dto.senderUserId,
            message: dto.message,
            messageType: finalMessageType,
            imageUrl: dto.imageUrl?.trim() || null,
            imagePath: dto.imagePath || null,
            imageUrl2: dto.imageUrl2?.trim() || null,
            imagePath2: dto.imagePath2 || null,
            invoiceId: dto.invoiceId,
            relatedId: dto.relatedId,
            relatedType: dto.relatedType,
            aligoMid: result.result?.mid || null,
            aligoMdid: result.result?.mdid || null,
            status: status,
            aligoStatus: result.result?.status || null,
            resultCode: result.result?.result_code?.toString() || null,
            resultMessage: result.result?.message || null,
            smsCount: result.result?.sms_cnt || null,
            failCount: isSuccess ? 0 : 1,
            sentAt: result.result?.reg_date ? new Date(result.result.reg_date) : new Date(),
            doneAt: result.result?.done_date ? new Date(result.result.done_date) : null,
            reservedAt: result.result?.reserve_date ? new Date(result.result.reserve_date) : null,
            createdById: dto.createdById,
          });

          this.logger.log(`[SMS 이력 저장] ${result.phone}: ${isSuccess ? '성공' : '실패'}`);
        }
      } catch (historyError) {
        // 이력 저장 실패해도 발송은 성공한 것으로 처리
        this.logger.error('[SMS 이력 저장 실패]', historyError);
      }

      return {
        success: true,
        type: finalMessageType,
        results,
      };
    } catch (error) {
      this.logger.error('알리고 SMS/MMS 발송 중 오류 발생', error);
      
      // axios 에러 처리
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 413) {
          const imageSize =
            dto.imageUrl || dto.imageUrl2 ? ' (이미지 포함, 2장 가능)' : '';
          throw new BadRequestException(`SMS 발송 실패: 요청 크기가 너무 큽니다${imageSize}. 이미지 크기를 줄이거나 압축해주세요. (HTTP 413)`);
        }
        if (error.response) {
          throw new BadRequestException(`SMS 발송 실패 (HTTP ${error.response.status}): ${error.response.data}`);
        }
        throw new BadRequestException(`SMS 발송 실패: ${error.message}`);
      }
      
      throw new BadRequestException('SMS/MMS 발송 중 오류가 발생했습니다.');
    }
  }

  /**
   * 전송 결과 목록 조회
   */
  async getSmsList(dto: GetSmsListDto): Promise<any> {
    if (!this.apiKey || !this.userId) {
      throw new BadRequestException('알리고 API 설정이 완료되지 않았습니다.');
    }

    try {
      const url = `${this.baseUrl}/list/`;
      const formData = new URLSearchParams();
      formData.append('key', this.apiKey);
      formData.append('user_id', this.userId);
      
      // 선택적 파라미터 추가
      if (dto.page) {
        formData.append('page', dto.page.toString());
      }
      if (dto.page_size) {
        formData.append('page_size', dto.page_size.toString());
      }
      if (dto.start_date) {
        formData.append('start_date', dto.start_date);
      }
      if (dto.limit_day) {
        formData.append('limit_day', dto.limit_day);
      }

      this.logger.log(`[전송 결과 목록 조회] API 호출 - URL: ${url}, page: ${dto.page || 1}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      // 응답 상태 확인
      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`[전송 결과 목록 조회] HTTP 에러 - Status: ${response.status}, Response: ${text.substring(0, 200)}`);
        throw new BadRequestException(`알리고 API 호출 실패: HTTP ${response.status}`);
      }

      // 응답 텍스트로 먼저 확인
      const responseText = await response.text();
      this.logger.log(`[전송 결과 목록 조회] 응답 텍스트: ${responseText.substring(0, 2000)}`);

      // JSON 파싱 시도
      let data;
      try {
        data = JSON.parse(responseText);
        // 응답 구조 로깅 (전체 개수 확인용)
        this.logger.log(`[전송 결과 목록 조회] 응답 구조 - result_code: ${data.result_code}, total_cnt: ${data.total_cnt}, total_count: ${data.total_count}, list length: ${data.list?.length || 0}`);
        
        // 첫 번째 항목의 필드 구조 로깅
        if (data.list && data.list.length > 0) {
          const firstItem = data.list[0];
          this.logger.log(`[전송 결과 목록 조회] 첫 번째 항목 필드명: ${JSON.stringify(Object.keys(firstItem))}`);
          this.logger.log(`[전송 결과 목록 조회] 첫 번째 항목 전체 데이터: ${JSON.stringify(firstItem, null, 2)}`);
          // 상태 관련 필드 상세 로깅
          this.logger.log(`[전송 결과 목록 조회] 상태 필드 - status: "${firstItem.status}", result: "${firstItem.result}", reserve_state: "${firstItem.reserve_state}"`);
        }
      } catch (parseError) {
        this.logger.error(`[전송 결과 목록 조회] JSON 파싱 실패 - 응답: ${responseText.substring(0, 500)}`);
        throw new BadRequestException('알리고 API 응답 형식이 올바르지 않습니다.');
      }

      // 응답 코드 확인
      const isSuccess = data.result_code === 1 || data.result_code === '1' || data.result_code === 0 || data.result_code === '0';
      
      if (!isSuccess) {
        this.logger.error(`[전송 결과 목록 조회] API 에러 - result_code: ${data.result_code}, message: ${data.message}`);
        throw new BadRequestException(data.message || `전송 결과 목록 조회에 실패했습니다. (코드: ${data.result_code})`);
      }

      return data;
    } catch (error) {
      this.logger.error('[전송 결과 목록 조회] 오류 발생', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`전송 결과 목록 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 전송 결과 상세 조회
   */
  async getSmsDetail(dto: GetSmsDetailDto): Promise<any> {
    if (!this.apiKey || !this.userId) {
      throw new BadRequestException('알리고 API 설정이 완료되지 않았습니다.');
    }

    if (!dto.mid) {
      throw new BadRequestException('메시지 ID(mid)는 필수입니다.');
    }

    try {
      const url = `${this.baseUrl}/sms_list/`;
      const formData = new URLSearchParams();
      formData.append('key', this.apiKey);
      formData.append('user_id', this.userId);
      formData.append('mid', dto.mid);
      
      // 선택적 파라미터 추가
      if (dto.page) {
        formData.append('page', dto.page.toString());
      }
      if (dto.page_size) {
        formData.append('page_size', dto.page_size.toString());
      }
      if (dto.start_date) {
        formData.append('start_date', dto.start_date);
      }
      if (dto.limit_day) {
        formData.append('limit_day', dto.limit_day);
      }

      this.logger.log(`[전송 결과 상세 조회] API 호출 - URL: ${url}, mid: ${dto.mid}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      // 응답 상태 확인
      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`[전송 결과 상세 조회] HTTP 에러 - Status: ${response.status}, Response: ${text.substring(0, 200)}`);
        throw new BadRequestException(`알리고 API 호출 실패: HTTP ${response.status}`);
      }

      // 응답 텍스트로 먼저 확인
      const responseText = await response.text();
      this.logger.log(`[전송 결과 상세 조회] 응답 텍스트: ${responseText.substring(0, 2000)}`);

      // JSON 파싱 시도
      let data;
      try {
        data = JSON.parse(responseText);
        // 첫 번째 항목의 필드 구조 로깅
        if (data.list && data.list.length > 0) {
          const firstItem = data.list[0];
          this.logger.log(`[전송 결과 상세 조회] 첫 번째 항목 필드명: ${JSON.stringify(Object.keys(firstItem))}`);
          this.logger.log(`[전송 결과 상세 조회] 첫 번째 항목 전체 데이터: ${JSON.stringify(firstItem, null, 2)}`);
          // 상태 관련 필드 상세 로깅
          this.logger.log(`[전송 결과 상세 조회] 상태 필드 상세 - sms_state: "${firstItem.sms_state}", status: "${firstItem.status}", result: "${firstItem.result}"`);
          this.logger.log(`[전송 결과 상세 조회] 상태 필드 타입 - sms_state 타입: ${typeof firstItem.sms_state}, 길이: ${firstItem.sms_state?.length}, 빈값: ${firstItem.sms_state === '' || firstItem.sms_state === null || firstItem.sms_state === undefined}`);
        } else {
          this.logger.log(`[전송 결과 상세 조회] list가 비어있거나 없음 - 응답 구조: ${JSON.stringify(data, null, 2)}`);
        }
      } catch (parseError) {
        this.logger.error(`[전송 결과 상세 조회] JSON 파싱 실패 - 응답: ${responseText.substring(0, 500)}`);
        throw new BadRequestException('알리고 API 응답 형식이 올바르지 않습니다.');
      }

      // 응답 코드 확인
      const isSuccess = data.result_code === 1 || data.result_code === '1' || data.result_code === 0 || data.result_code === '0';
      
      if (!isSuccess) {
        this.logger.error(`[전송 결과 상세 조회] API 에러 - result_code: ${data.result_code}, message: ${data.message}`);
        throw new BadRequestException(data.message || `전송 결과 상세 조회에 실패했습니다. (코드: ${data.result_code})`);
      }

      return data;
    } catch (error) {
      this.logger.error('[전송 결과 상세 조회] 오류 발생', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`전송 결과 상세 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

