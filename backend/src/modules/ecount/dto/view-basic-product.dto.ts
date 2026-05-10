export class ViewBasicProductDto {
  PROD_CD?: string; // 품목코드 (최대 20자)
  PROD_TYPE?: string; // 품목구분 (0:원재료, 1:제품, 2:반제품, 3:상품, 4:부재료, 7:무형상품, 여러개는 '∬'로 구분)
}

export interface EcountProduct {
  PROD_CD: string; // 품목코드
  PROD_DES: string; // 품목명
  SIZE_FLAG?: string; // 규격구분
  SIZE_DES?: string; // 규격
  UNIT?: string; // 단위
  PROD_TYPE?: string; // 품목구분
  SET_FLAG?: string; // 세트여부
  BAL_FLAG?: string; // 재고수량관리
  WH_CD?: string; // 생산공정
  IN_PRICE?: number; // 입고단가
  IN_PRICE_VAT?: string; // 입고단가Vat포함여부
  OUT_PRICE?: number; // 출고단가
  OUT_PRICE_VAT?: string; // 출고단가Vat포함여부
  REMARKS_WIN?: string; // 검색창내용
  CLASS_CD?: string; // 그룹코드
  CLASS_CD2?: string; // 그룹코드2
  CLASS_CD3?: string; // 그룹코드3
  BAR_CODE?: string; // 바코드
  TAX?: number; // 부가가치세율
  VAT_RATE_BY?: number; // 부가세율(매입)
  CS_FLAG?: string; // C-Portal사용여부
  REMARKS?: string; // 적요
  [key: string]: any; // 기타 필드들
}

export interface EcountApiResponse {
  Status: number | string; // 숫자 또는 문자열로 올 수 있음 (실제 응답에서 "200" 문자열로 오는 경우가 있음)
  Error?: {
    Code?: string;
    Message?: string;
    MessageDetail?: string;
  };
  Errors?: any; // 일부 응답에서는 Errors 필드 사용
  Data?: {
    EXPIRE_DATE?: string;
    QUANTITY_INFO?: string;
    TRACE_ID?: string;
    TotalCnt?: number;
    Result?: EcountProduct[];
  };
}

