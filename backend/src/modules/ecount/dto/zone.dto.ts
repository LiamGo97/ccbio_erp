export class GetZoneDto {
  COM_CODE: string; // 회사코드 (6자리)
}

export interface ZoneApiResponse {
  Status: number;
  Error?: {
    Code?: string;
    Message?: string;
    MessageDetail?: string;
  };
  Data?: {
    ZONE?: string; // Sub domain Zone
    DOMAIN?: string; // Domain
    EXPIRE_DATE?: string;
  };
  Timestamp?: string;
}


