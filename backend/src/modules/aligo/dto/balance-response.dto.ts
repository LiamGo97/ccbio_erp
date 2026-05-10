export class BalanceResponseDto {
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

