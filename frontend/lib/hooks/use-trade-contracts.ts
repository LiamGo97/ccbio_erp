import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface TradeContract {
  id: string;
  contractId: string;
  contractNo?: string | null;
  status?: string | null;
  contractStatus?: string | null;
  exportCountry?: string | null;
  exportCountryName?: string | null;
  exporter?: string | null;
  exporterName?: string | null;
  productName?: string | null;
  quota?: string | null;
  fumigation?: string | null;
  customsDuty?: string | null;
  contractGoogleDriveFileId?: string | null;
  contractFileName?: string | null;
  // 발주 기본 정보
  orderDate?: string | null;
  // 선적 정보
  shippingLine?: string | null;
  shippingLineName?: string | null;
  // 상품 정보
  grade?: string | null;
  gradeName?: string | null;
  packingType?: string | null;
  packingName?: string | null;
  quantity?: number | null;
  // 가격 정보
  unitPrice?: number | null;
  currency?: string | null;
  currencyName?: string | null;
  commissionDollar?: string | null;
  commissionMonth?: string | null;
  // 기타 정보
  destination?: string | null;
  destinationName?: string | null;
  notes?: string | null;
  newOld?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: {
    id: number;
    name: string;
    email: string;
  } | null;
  orderCount?: number; // 현재 주문 개수
  totalOrderCount?: number | null; // 계약에 계획된 전체 부킹(주문) 개수
  orderStatusSummary?: Record<string, number>; // 무역 상태 이름과 개수
  monthlyOrderPlan?: Record<string, number> | null; // 월별 계획 { "YYYY-MM": count }
  monthlyOrderActual?: Record<string, number> | null; // 월별 실제 주문 개수 { "YYYY-MM": count }
}

export interface CreateTradeContractDto {
  contractNo?: string | null;
  exporter?: string | null;
  exportCountry?: string | null;
  productName?: string | null;
  quota?: string | null;
  fumigation?: string | null;
  customsDuty?: string | null;
  contractGoogleDriveFileId?: string | null;
  contractFileName?: string | null;
  status?: string | null;
  // 발주 기본 정보
  orderDate?: string | null;
  // 상품 정보
  grade?: string | null;
  packingType?: string | null;
  quantity?: number | null;
  // 가격 정보
  unitPrice?: number | null;
  currency?: string | null;
  commissionDollar?: string | null;
  commissionMonth?: string | null;
  // 기타 정보
  destination?: string | null;
  notes?: string | null;
  newOld?: string | null;
  totalOrderCount?: number | null;
  monthlyOrderPlan?: Record<string, number> | null;
}

export interface UpdateTradeContractDto {
  contractNo?: string | null;
  exporter?: string | null;
  exportCountry?: string | null;
  productName?: string | null;
  quota?: string | null;
  fumigation?: string | null;
  customsDuty?: string | null;
  contractGoogleDriveFileId?: string | null;
  contractFileName?: string | null;
  status?: string | null;
  // 발주 기본 정보
  orderDate?: string | null;
  // 상품 정보
  grade?: string | null;
  packingType?: string | null;
  quantity?: number | null;
  // 가격 정보
  unitPrice?: number | null;
  currency?: string | null;
  commissionDollar?: string | null;
  commissionMonth?: string | null;
  // 기타 정보
  destination?: string | null;
  notes?: string | null;
  newOld?: string | null;
  totalOrderCount?: number | null;
  monthlyOrderPlan?: Record<string, number> | null;
}

export function useTradeContracts(params?: {
  contractStatus?: string | string[];
  /** 단일 상품 필터 (하위 호환). `productNames`가 지정되면 무시됩니다. */
  productName?: string;
  productNames?: string[];
  contractNo?: string;
  createdById?: number;
  exporters?: string[];
}) {
  return useQuery<TradeContract[]>({
    queryKey: ['trade-contracts', params?.contractStatus, params?.productNames, params?.productName, params?.contractNo, params?.createdById, params?.exporters],
    queryFn: async () => {
      const contractStatus = params?.contractStatus;
      const contractStatusParam =
        contractStatus === undefined || contractStatus === '__all__'
          ? undefined
          : Array.isArray(contractStatus)
            ? contractStatus.length === 0
              ? ['__EMPTY__']
              : contractStatus
            : [contractStatus];
      const searchParams = new URLSearchParams();
      if (contractStatusParam?.length) {
        contractStatusParam.forEach((s) => searchParams.append('contractStatus', s));
      }
      let productNamesParam = params?.productNames;
      if (productNamesParam === undefined && params?.productName && params.productName !== '__all__') {
        productNamesParam = [params.productName];
      }
      if (productNamesParam !== undefined) {
        if (productNamesParam.length === 0) {
          searchParams.append('productName', '');
        } else {
          productNamesParam.forEach((p) => searchParams.append('productName', p));
        }
      }
      if (params?.contractNo?.trim()) searchParams.set('contractNo', params.contractNo.trim());
      if (params?.createdById != null && !isNaN(params.createdById)) searchParams.set('createdById', String(params.createdById));
      // 수출사: 빈 배열이면 exporters= 로 보내서 백엔드에서 결과 없음 처리
      if (params?.exporters !== undefined) {
        if (params.exporters.length === 0) {
          searchParams.append('exporters', '');
        } else {
          params.exporters.forEach((e) => searchParams.append('exporters', e));
        }
      }
      const queryString = searchParams.toString();
      const url = queryString ? `/trade/contracts?${queryString}` : '/trade/contracts';
      const response = await api.get(url);
      return response.data;
    },
  });
}

export function useTradeContract(id: string | undefined) {
  return useQuery<TradeContract>({
    queryKey: ['trade-contract', id],
    queryFn: async () => {
      console.log('[useTradeContract] 계약 조회 시작 - id:', id);
      console.log('[useTradeContract] API 호출: GET /trade/contracts/' + id);
      const response = await api.get(`/trade/contracts/${id}`);
      console.log('[useTradeContract] 계약 조회 완료 - response:', {
        id: response.data?.id,
        contractId: response.data?.contractId,
        contractNo: response.data?.contractNo,
      });
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateTradeContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTradeContractDto) => {
      // 백엔드에 간단한 계약 생성 API가 없으므로, 일단 save 엔드포인트를 사용
      // 하지만 간단한 정보만으로는 작동하지 않을 수 있음
      // TODO: 백엔드에 간단한 계약 생성 API 추가 필요
      const response = await api.post('/trade/contracts/save', {
        originalFileName: data.contractFileName || 'contract.pdf',
        draftOrders: [], // 빈 주문 배열로 계약만 생성
        contractNumber: data.contractNo,
        googleDriveFileId: data.contractGoogleDriveFileId,
        status: data.status || 'ORDER',
        rawResult: null,
        notes: null,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade-contracts'] });
    },
  });
}

export function useUpdateTradeContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTradeContractDto }) => {
      const response = await api.put(`/trade/contracts/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['trade-contract'] });
    },
  });
}

export function useDeleteTradeContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // 계약 전용 삭제 (tc_id). orders/:id 는 to_id 우선이라 tc_id·to_id 숫자 충돌 시 오삭제 가능했음.
      const response = await api.delete(`/trade/contracts/${id}`);
      return response.data;
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['trade-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['trade-contract'] });
      queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      queryClient.invalidateQueries({ queryKey: ['trade-order', deletedId] });
      queryClient.invalidateQueries({ queryKey: ['trade-order'] });
    },
  });
}

/** 입고예정 재고 컨테이너 목록 (confirmed와 동일 패턴: search/productName/includeExcluded 반응형) */
export interface UseContainersPendingParams {
  search?: string;
  /** 단일 상품(하위 호환). `productNames`가 있으면 무시 */
  productName?: string;
  productNames?: string[];
  includeExcluded?: boolean;
}

export function useContainersPending(params: UseContainersPendingParams = {}) {
  return useQuery({
    queryKey: [
      'trade-contracts',
      'containers',
      'pending',
      params.search ?? '',
      params.productNames,
      params.productName ?? '',
      params.includeExcluded ?? false,
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('inboundStatus', 'PENDING');
      searchParams.set('includeSheetReservations', 'false');
      if (params.search?.trim()) {
        searchParams.set('search', params.search.trim());
      }
      let productNamesResolved = params.productNames;
      if (productNamesResolved === undefined && params.productName?.trim()) {
        productNamesResolved = [params.productName.trim()];
      }
      if (productNamesResolved !== undefined) {
        if (productNamesResolved.length === 0) {
          searchParams.append('productName', '');
        } else {
          productNamesResolved.forEach((p) => searchParams.append('productName', p));
        }
      }
      if (params.includeExcluded) {
        searchParams.set('includeExcluded', 'true');
      }
      const qs = searchParams.toString();
      const response = await api.get(`/trade/contracts/containers?${qs}`);
      return response.data as any[];
    },
  });
}

/** 입고확정 재고 컨테이너 목록 (판매 페이지 useSales 패턴과 동일하게 search 반응형) */
export interface UseContainersConfirmedParams {
  search?: string;
  /** 단일 상품(하위 호환). `productNames`가 있으면 무시 */
  productName?: string;
  productNames?: string[];
  includeExcluded?: boolean;
  returnStatus?: string[];
  /** true면 주간재고용 `getConfirmedInventoryForDashboard` — 재고 목록 제외 컨만 백엔드에서 제외. */
  forDashboardDisplay?: boolean;
  /**
   * false면 판매예약 시트 집계를 가용 차감에서 제외 (입고예정 재고 API와 동일).
   * 미지정 시 백엔드 기본(true) — 대시보드 등 시트 반영이 필요한 호출은 그대로 둠.
   */
  includeSheetReservations?: boolean;
}

export function useContainersConfirmed(params: UseContainersConfirmedParams = {}) {
  const sheetRes = params.includeSheetReservations;
  return useQuery({
    queryKey: [
      'trade-contracts',
      'containers',
      'confirmed',
      params.search ?? '',
      params.productNames,
      params.productName ?? '',
      params.includeExcluded ?? false,
      params.returnStatus ?? [],
      params.forDashboardDisplay ?? false,
      sheetRes === false ? false : 'default',
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('inboundStatus', 'CONFIRMED');
      if (params.search?.trim()) {
        searchParams.set('search', params.search.trim());
      }
      let productNamesResolved = params.productNames;
      if (productNamesResolved === undefined && params.productName?.trim()) {
        productNamesResolved = [params.productName.trim()];
      }
      if (productNamesResolved !== undefined) {
        if (productNamesResolved.length === 0) {
          searchParams.append('productName', '');
        } else {
          productNamesResolved.forEach((p) => searchParams.append('productName', p));
        }
      }
      if (params.includeExcluded) {
        searchParams.set('includeExcluded', 'true');
      }
      if (params.returnStatus && params.returnStatus.length > 0) {
        searchParams.set('returnStatus', params.returnStatus.join(','));
      }
      if (params.forDashboardDisplay) {
        searchParams.set('forDashboardDisplay', 'true');
      }
      if (params.includeSheetReservations === false) {
        searchParams.set('includeSheetReservations', 'false');
      }
      const qs = searchParams.toString();
      const response = await api.get(`/trade/contracts/containers?${qs}`);
      return response.data as any[];
    },
  });
}

function resolveFinanceInventoryProductNames(params: {
  productNames?: string[];
  /** @deprecated productNames 사용 권장 */
  productName?: string;
}): string[] | undefined {
  if (params.productNames !== undefined) {
    return params.productNames;
  }
  const s = params.productName?.trim();
  if (s && s !== '__all__') return [s];
  return undefined;
}

/** 재무 입고예정 재고 - BL 단위 (신규 API) */
export interface UseFinanceInventoryPendingByBlParams {
  search?: string;
  /** @deprecated productNames 사용 권장 */
  productName?: string;
  /** 상품 코드 다중. 빈 배열이면 결과 없음, 미전달이면 필터 없음 */
  productNames?: string[];
  includeExcluded?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export function useFinanceInventoryPendingByBl(params: UseFinanceInventoryPendingByBlParams = {}) {
  const productNamesKey =
    params.productNames !== undefined
      ? params.productNames.join('\u0001')
      : params.productName ?? '';
  return useQuery({
    queryKey: [
      'trade-contracts',
      'finance',
      'inventory-pending',
      params.search ?? '',
      productNamesKey,
      params.includeExcluded ?? false,
      params.dateFrom ?? '',
      params.dateTo ?? '',
    ],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.search?.trim()) sp.set('search', params.search.trim());
      const resolved = resolveFinanceInventoryProductNames(params);
      if (resolved !== undefined) {
        if (resolved.length === 0) sp.append('productName', '');
        else resolved.forEach((p) => sp.append('productName', p));
      }
      if (params.includeExcluded) sp.set('includeExcluded', 'true');
      if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
      if (params.dateTo) sp.set('dateTo', params.dateTo);
      const qs = sp.toString();
      const response = await api.get(`/trade/contracts/finance/inventory-pending${qs ? `?${qs}` : ''}`);
      return response.data as any[];
    },
  });
}

/** 재무 입고확정 재고 - BL 단위 */
export interface UseFinanceInventoryConfirmedByBlParams {
  search?: string;
  /** @deprecated productNames 사용 권장 */
  productName?: string;
  /** 상품 코드 다중. 빈 배열이면 결과 없음, 미전달이면 필터 없음 */
  productNames?: string[];
  warehouseNames?: string[];
  inventoryStatus?: string[];
  returnStatus?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export function useFinanceInventoryConfirmedByBl(params: UseFinanceInventoryConfirmedByBlParams = {}) {
  const productNamesKey =
    params.productNames !== undefined
      ? params.productNames.join('\u0001')
      : params.productName ?? '';
  return useQuery({
    queryKey: [
      'trade-contracts',
      'finance',
      'inventory-confirmed',
      params.search ?? '',
      productNamesKey,
      params.warehouseNames ?? [],
      params.inventoryStatus ?? [],
      params.returnStatus ?? [],
      params.dateFrom ?? '',
      params.dateTo ?? '',
    ],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.search?.trim()) sp.set('search', params.search.trim());
      const resolved = resolveFinanceInventoryProductNames(params);
      if (resolved !== undefined) {
        if (resolved.length === 0) sp.append('productName', '');
        else resolved.forEach((p) => sp.append('productName', p));
      }
      if (params.warehouseNames?.length) sp.set('warehouseNames', params.warehouseNames.join(','));
      if (params.inventoryStatus?.length) sp.set('inventoryStatus', params.inventoryStatus.join(','));
      if (params.returnStatus?.length) sp.set('returnStatus', params.returnStatus.join(','));
      if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
      if (params.dateTo) sp.set('dateTo', params.dateTo);
      const qs = sp.toString();
      const response = await api.get(`/trade/contracts/finance/inventory-confirmed${qs ? `?${qs}` : ''}`);
      return response.data as any[];
    },
  });
}

export interface UseContainersScheduledParams {
  /** 판매 대시보드 통관 전 재고 탭: 주간 재고와 동일 집계(시트는 `예약등록`만) 보장용 API 경로 */
  forDashboardScheduled?: boolean;
}

/** 입고예정(통관 전 재고) 컨테이너 목록 - listContainers(INBOUND_SCHEDULED). 입고예정재고 상세와 수치 일치용 */
export function useContainersScheduled(params: UseContainersScheduledParams = {}) {
  const forDashboardScheduled = params.forDashboardScheduled === true;
  return useQuery({
    queryKey: ['trade-contracts', 'containers', 'scheduled', forDashboardScheduled],
    queryFn: async () => {
      const searchParams: Record<string, string> = { inboundStatus: 'INBOUND_SCHEDULED' };
      if (forDashboardScheduled) {
        searchParams.forDashboardScheduled = 'true';
      }
      const response = await api.get('/trade/contracts/containers', { params: searchParams });
      return response.data as any[];
    },
  });
}

/** 실패 원인 분류 코드 */
export type EtaUpdateBatchErrorCode =
  | 'NETWORK'
  | 'API_LIMIT'
  | 'UNIQUE_SHIPMENT_LIMIT'
  | 'POSSIBLE_QUOTA'
  | 'API_KEY_EXPIRED'
  | 'API_ERROR'
  | 'UNKNOWN';

/** ETA 일괄 갱신 이력 한 건 결과 항목 */
export interface EtaUpdateBatchResultItem {
  orderId: string;
  /** 계약번호, 화면 표시용 */
  contractNo?: string | null;
  /** 주문 BK(부킹번호), 화면 표시용 */
  bk?: string | null;
  success: boolean;
  changed?: boolean;
  before?: {
    eta?: string | null;
    etd?: string | null;
    shippingLine?: string | null;
    containers?: Array<{ containerNo?: string | null; weight?: number | null }>;
  };
  after?: {
    eta?: string | null;
    etd?: string | null;
    shippingLine?: string | null;
    containers?: Array<{ containerNo?: string | null; weight?: number | null }>;
  };
  /** 실패 시 에러 메시지 */
  error?: string;
  /** 실패 원인 분류 */
  errorCode?: EtaUpdateBatchErrorCode | null;
  /** 추가 안내 (예: 고유 선적 잔여 0 등) */
  errorDetail?: string | null;
}

/** API 사용량 (갱신 완료 시점 SeaRates 잔여) */
export interface ApiUsageAfter {
  apiCalls?: { used?: number; total?: number; remaining?: number } | null;
  uniqueShipments?: { used?: number; total?: number; remaining?: number } | null;
}

export interface EtaUpdateBatchHistoryItem {
  id: number;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
  trigger: string;
  filterParams: Record<string, unknown> | null;
  orderIds: string[];
  total: number;
  success: number;
  failed: number;
  results: EtaUpdateBatchResultItem[];
  apiUsageAfter?: ApiUsageAfter | null;
}

export interface GetEtaUpdateBatchHistoryResponse {
  data: EtaUpdateBatchHistoryItem[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export function useEtaUpdateBatchHistory(params?: {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery<GetEtaUpdateBatchHistoryResponse>({
    queryKey: [
      'trade-contracts',
      'eta-update-history',
      params?.page ?? 1,
      params?.limit ?? 20,
      params?.sortBy ?? 'createdAt',
      params?.sortOrder ?? 'desc',
    ],
    queryFn: async () => {
      const response = await api.get<GetEtaUpdateBatchHistoryResponse>('/trade/contracts/eta-update-history', {
        params: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          sortBy: params?.sortBy ?? 'createdAt',
          sortOrder: params?.sortOrder ?? 'desc',
        },
      });
      return response.data;
    },
  });
}

