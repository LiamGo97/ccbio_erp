import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface EcountProduct {
  PROD_CD: string; // 품목코드
  PROD_DES: string; // 품목명
  SIZE_FLAG?: string; // 규격구분
  SIZE_DES?: string; // 규격
  UNIT?: string; // 단위
  PROD_TYPE?: string; // 품목구분
  REMARKS_WIN?: string; // 검색창내용
  OUT_PRICE?: number; // 출고단가
  [key: string]: any;
}

export interface ViewBasicProductParams {
  prodCd?: string; // 품목코드
  prodType?: string; // 품목구분 (0:원재료, 1:제품, 2:반제품, 3:상품, 4:부재료, 7:무형상품)
  sessionId?: string; // 세션 ID (선택)
}

export interface ViewBasicProductResponse {
  success: boolean;
  data: EcountProduct[];
  count: number;
}

export function useEcountProducts(params: ViewBasicProductParams = {}) {
  return useQuery({
    queryKey: ['ecount', 'products', params],
    queryFn: async () => {
      const queryParams: Record<string, string> = {};
      if (params.prodCd) {
        queryParams.prodCd = params.prodCd;
      }
      if (params.prodType) {
        queryParams.prodType = params.prodType;
      }
      if (params.sessionId) {
        queryParams.sessionId = params.sessionId;
      }

      const response = await api.get<ViewBasicProductResponse>(
        '/ecount/products',
        { params: queryParams },
      );
      return response.data;
    },
    enabled: false, // 수동으로 호출하도록 설정
    staleTime: 5 * 60 * 1000, // 5분간 캐시
  });
}


