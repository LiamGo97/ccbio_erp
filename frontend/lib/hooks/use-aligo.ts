import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface AligoBalance {
  result_code: number; // 응답 코드 (0이면 성공)
  message: string;
  SMS_CNT?: number; // SMS 잔여 건수
  LMS_CNT?: number; // LMS 잔여 건수
  MMS_CNT?: number; // MMS 잔여 건수
  remain_point?: number; // 잔여 포인트 (일부 API에서 사용)
  sms_yn?: string; // SMS 사용 가능 여부
  lms_yn?: string; // LMS 사용 가능 여부
  mms_yn?: string; // MMS 사용 가능 여부
}

export interface SendSmsRecipient {
  phone: string;
  name?: string;
}

export interface SendSmsPayload {
  message: string;
  recipients: SendSmsRecipient[];
  sender?: string;
  imageUrl?: string; // MMS 1번 이미지 URL
  imageUrl2?: string; // MMS 2번 (알리고 image2)
  imagePath?: string;
  imagePath2?: string;
}

export interface SendSmsResult {
  success: boolean;
  type: 'SMS' | 'MMS';
  results: Array<{
    phone: string;
    name?: string;
    type: 'SMS' | 'MMS';
    result: any;
  }>;
}

export interface GetSmsListParams {
  page?: number;
  page_size?: number;
  start_date?: string; // YYYYMMDD
  limit_day?: string; // YYYYMMDD
}

export interface SmsListItem {
  mid?: string; // 메시지 ID (목록 API)
  mdid?: string; // 메시지 상세 ID (상세 조회 API)
  type?: string; // 메시지 타입 (SMS, LMS, MMS) - API 응답 필드명
  msg_type?: string; // 메시지 타입 (하위 호환성)
  sender?: string; // 발신번호
  receiver?: string; // 수신번호
  msg?: string; // 메시지 내용 (목록 API에만 있음)
  status?: string; // 전송 상태 (목록 API)
  sms_state?: string; // 전송 상태 (상세 조회 API) - 한글: "발송완료", "대기" 등
  result?: string; // 결과 코드
  result_msg?: string; // 결과 메시지
  reg_date?: string; // 발송일시 - API 응답 필드명 (YYYY-MM-DD HH:mm:ss)
  send_date?: string; // 발송일시 (하위 호환성)
  done_date?: string; // 완료일시
  reserve_date?: string; // 예약일시 (상세 조회 API)
  sms_count?: string; // SMS 건수
  fail_count?: number; // 실패 건수
  reserve_state?: string; // 예약 상태
  etc1?: string; // 기타1
  etc2?: string; // 기타2
  etc3?: string; // 기타3
  etc4?: string; // 기타4
  etc5?: string; // 기타5
}

export interface SmsListResponse {
  result_code: number;
  message: string;
  list?: SmsListItem[];
  // 알리고 API는 전체 개수를 제공하지 않음
  // total_cnt?: number; // 전체 건수 (API에서 제공하지 않음)
  // page?: number; // 현재 페이지 (API에서 제공하지 않음)
  // page_size?: number; // 페이지당 건수 (API에서 제공하지 않음)
}

// 잔액 조회
export function useAligoBalance() {
  return useQuery<AligoBalance>({
    queryKey: ['aligo', 'balance'],
    queryFn: async () => {
      const response = await api.get<AligoBalance>('/aligo/balance');
      return response.data;
    },
    refetchInterval: 60000, // 1분마다 자동 갱신
  });
}

// SMS 발송
export function useSendSms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SendSmsPayload) => {
      const response = await api.post<SendSmsResult>('/aligo/sms/send', data);
      return response.data;
    },
    onSuccess: () => {
      // 발송 후 잔액 갱신 및 전송 결과 목록 갱신
      queryClient.invalidateQueries({ queryKey: ['aligo', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['aligo', 'sms-list'] });
    },
  });
}

// 전송 결과 목록 조회
export function useSmsList(params?: GetSmsListParams) {
  return useQuery<SmsListResponse>({
    queryKey: ['aligo', 'sms-list', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.page) {
        queryParams.append('page', params.page.toString());
      }
      if (params?.page_size) {
        queryParams.append('page_size', params.page_size.toString());
      }
      if (params?.start_date) {
        queryParams.append('start_date', params.start_date);
      }
      if (params?.limit_day) {
        queryParams.append('limit_day', params.limit_day);
      }
      
      const queryString = queryParams.toString();
      const url = `/aligo/sms/list${queryString ? `?${queryString}` : ''}`;
      const response = await api.get<SmsListResponse>(url);
      return response.data;
    },
  });
}

// 전송 결과 상세 조회
export function useSmsDetail(mid?: string) {
  return useQuery<SmsListResponse>({
    queryKey: ['aligo', 'sms-detail', mid],
    queryFn: async () => {
      if (!mid) {
        throw new Error('메시지 ID가 필요합니다.');
      }
      const response = await api.get<SmsListResponse>(`/aligo/sms/detail?mid=${encodeURIComponent(mid)}`);
      return response.data;
    },
    enabled: !!mid,
  });
}

