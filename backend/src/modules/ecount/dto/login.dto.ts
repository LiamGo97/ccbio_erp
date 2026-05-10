export class LoginDto {
  COM_CODE: string; // 회사코드 (6자리)
  USER_ID: string; // 사용자ID (최대 30자)
  API_CERT_KEY: string; // 테스트 인증키 (최대 50자)
  LAN_TYPE?: string; // 언어설정 (기본값: ko-KR)
  ZONE: string; // ZONE (2자리)
}

export interface LoginApiResponse {
  Status: number;
  Error?: {
    Code?: string;
    Message?: string;
    MessageDetail?: string;
  };
  Data?: {
    EXPIRE_DATE?: string;
    NOTICE?: string;
    Code?: string;
    Datas?: {
      COM_CODE?: string;
      USER_ID?: string;
      SESSION_ID?: string; // 세션 ID
    };
    Message?: string;
    RedirectUrl?: string;
  };
  Timestamp?: string;
}


