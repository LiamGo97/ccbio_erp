export class GetDepositTransactionDto {
  ACCOUNT_CD?: string; // 계좌코드
  START_DATE?: string; // 시작일자 (YYYYMMDD)
  END_DATE?: string; // 종료일자 (YYYYMMDD)
  TRAN_TYPE?: string; // 거래구분 (예: 입금, 출금 등)
}

export interface DepositTransaction {
  TRAN_DATE?: string; // 거래일자
  TRAN_TYPE?: string; // 거래구분
  TRAN_AMT?: number; // 거래금액
  BALANCE?: number; // 잔액
  REMARKS?: string; // 적요/비고
  DEPOSIT_ACCOUNT?: string; // 입금계좌
  DEPOSITOR?: string; // 입금자명
  REF_NO?: string; // 참조번호
  [key: string]: any; // 기타 필드들
}

export interface DepositTransactionApiResponse {
  Status: number | string;
  Error?: {
    Code?: string;
    Message?: string;
    MessageDetail?: string;
  };
  Errors?: any;
  Data?: {
    EXPIRE_DATE?: string;
    QUANTITY_INFO?: string;
    TRACE_ID?: string;
    TotalCnt?: number;
    Result?: DepositTransaction[];
  };
}


