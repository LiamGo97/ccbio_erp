import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

export interface CreateSalesDto {
  customerId?: string | null;
  phone?: string;
  companyName?: string;
  ceo?: string;
  region?: string;
  customerPostalCode?: string;
  customerAddress?: string;
  customerAddressRoad?: string;
  customerAddressJibun?: string;
  customerLegalBCode?: string;
  customerAddressDefaultType?: string;
  customerCity?: string;
  addressDetail?: string;
  unloadingPostalCode?: string;
  unloadingAddress?: string;
  unloadingAddressRoad?: string;
  unloadingAddressJibun?: string;
  unloadingLegalBCode?: string;
  unloadingAddressDetail?: string;
  unloadingRegion?: string;
  unloadingCity?: string;
  /** 하차지로 선택한 고객 배송지 id — 저장 시 해당 배송지 행을 하차지 필드로 갱신 */
  unloadingDeliveryAddressId?: string | null;
  reservationDate?: string | null;
  salesDate?: string | null;
  requestVehicle?: string | null;
  transportFee?: number | null;
  advancePaymentRatio?: number | null;
  advancePaymentAmount?: number | null;
  /** 예약 등록(RESERVED) / 판매 등록(SALE). 없으면 입고상태 기준 자동 */
  registerAs?: 'RESERVED' | 'SALE';
  items: Array<{
    containerId: string;
    containerType?: 'CONTAINER' | 'CARGO' | null;
    cargoBales?: number | null;
    cargoWeight?: number | null;
    stoCost?: number | null;
    dtCost?: number | null;
    workFee?: number | null;
    onsiteWorkFee?: number | null;
    advancePaymentRatio?: number | null;
    margin?: number | null;
    salesUnitPrice?: number | null;
    salesUnitPriceStage?: string | null; // LOADING | ARRIVAL | UNLOADING
    status?: string | null;
  }>;
}

export interface SalesProductInfo {
  itemId?: string; // 판매 항목 ID (edit 모드용)
  containerId?: string | null; // 컨테이너 ID (edit 모드용)
  containerNo: string | null;
  sequence?: number | null; // 컨테이너 순번
  contractNo?: string | null; // 계약번호
  bk?: string | null; // BK 번호
  bl?: string | null; // BL 번호
  productName: string | null;
  packingType: string | null;
  packingName: string | null;
  exporter?: string | null;
  exporterName?: string | null;
  tradeGrade: string | null;
  tradeGradeName: string | null;
  salesGrade: string | null;
  salesGradeName: string | null;
  containerType: 'CONTAINER' | 'CARGO';
  bales: number | null;
  soldBales?: number | null; // 판매한 베일수 (상세 표시용)
  salesBales?: number | null; // 영업 베일
  tradeBales?: number | null; // 무역 베일
  weight: number | null;
  cargoBales?: number | null; // 카고 베일
  cargoWeight?: number | null; // 카고 중량
  salesUnitPrice: number | null;
  salesUnitPriceStage?: string | null; // LOADING | ARRIVAL | UNLOADING
  margin: number | null;
  exchangeRate: number | null;
  etaDate: string | null;
  status: string | null;
  statusName: string | null;
  stoCost?: number | null;
  dtCost?: number | null;
  workFee?: number | null;
  onsiteWorkFee?: number | null;
  advancePaymentRatio?: number | null;
  pendingPurchaseCost?: number | null; // 예정원가
  confirmedPurchaseCost?: number | null; // 확정원가
  inboundStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null; // 입고 상태
  inboundWarehouse?: string | null; // 입고 창고 코드
  inboundWarehouseName?: string | null; // 입고 창고 이름
  warehouseId?: number | null; // 창고 ID (호환성을 위해 유지)
  warehouseName?: string | null; // 창고명 (호환성을 위해 유지)
}

export interface Sales {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerCeo?: string | null;
  reservationDate: string | null;
  salesDate: string | null;
  requestVehicle: string | null;
  transportFee: number | null;
  registeredBy: number | null;
  registeredByName: string | null;
  createdAt: string;
  updatedAt: string;
  status: string | null;
  statusName: string | null;
  /** 운송관리 배송 ID (클릭 시 해당 배송 상세로 이동용) */
  deliveryId?: string | null;
  /** 운송관리 배송 상태 (PENDING_DISPATCH, DISPATCH_REQUESTED, LOADING_COMPLETED, UNLOADING_COMPLETED 등) */
  deliveryStatus?: string | null;
  /** 운송번호 (운송관리에서 사용) */
  deliveryOrderNumber?: string | null;
  /** 전체 판매 취소 시 설정됨 (includeCancelled 옵션으로 취소 건 포함 시) */
  cancelledAt?: string | null;
  productInfo: SalesProductInfo[];
  customer?: {
    id: string;
    companyName?: string | null;
    phone?: string | null;
    ceo?: string | null;
    address?: string | null;
  } | null;
}

export interface GetSalesParams {
  page?: number;
  limit?: number;
  search?: string;
  bkBl?: string;
  /** 단일 상태 (레거시). statuses 사용 시 무시 */
  status?: string;
  /** 상태 다중 선택 (SALES_ITEM_RESERVED, SALES_ITEM_SOLD, SALES_ITEM_COMPLETED 등) */
  statuses?: string[];
  startDate?: string;
  endDate?: string;
  /** 날짜 필터 기준: createdAt(등록일) | invoiceIssuedAt(세금계산서 발행일) */
  dateType?: 'createdAt' | 'invoiceIssuedAt';
  /** 창고 ID 다중 선택 (입고 창고 기준). 전체 선택이면 생략, 0개 선택이면 warehouseFilter: 'none' */
  warehouseIds?: number[];
  /** 창고 0개 선택 시 결과 없음 */
  warehouseFilter?: 'none';
  /** true 이면 전체 취소된 판매도 목록에 포함 */
  includeCancelled?: boolean;
  /** 'none' 이면 상태 필터로 결과 없음 (선택 0개일 때) */
  statusFilter?: 'none';
  /** 판매 단가 구분(상차/도착 등 코드). 지정 시 해당 구분 항목이 1건 이상인 판매만 */
  salesUnitPriceStage?: string;
  sortBy?: 'createdAt' | 'reservationDate' | 'salesDate' | 'customerName' | 'status';
  sortOrder?: 'asc' | 'desc';
}

function serializeParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .flatMap(([k, v]) =>
      Array.isArray(v)
        ? (v as unknown[]).map((item) => `${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`)
        : [`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`],
    )
    .join('&');
}

export function useSales(params: GetSalesParams = {}) {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: async () => {
      const response = await api.get('/sales', {
        params,
        paramsSerializer: (p) => serializeParams(p as Record<string, unknown>),
      });
      return response.data as {
        data: Sales[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    },
    // 필터/정렬 변경 시 이전 데이터를 유지해 테이블 깜빡임 방지 (운송관리와 동일)
    placeholderData: (previousData) => previousData,
  });
}

export interface SalesDetail extends Sales {
  customerCeo?: string | null;
  customerRegion?: string | null;
  customerCity?: string | null;
  customerPostalCode?: string | null;
  customerAddress?: string | null;
  customerAddressRoad?: string | null;
  customerAddressJibun?: string | null;
  customerLegalBCode?: string | null;
  customerAddressDefaultType?: string | null;
  customerAddressDetail?: string | null;
  unloadingPostalCode?: string | null;
  unloadingAddress?: string | null;
  unloadingAddressRoad?: string | null;
  unloadingAddressJibun?: string | null;
  unloadingLegalBCode?: string | null;
  unloadingAddressDetail?: string | null;
  unloadingRegion?: string | null;
  unloadingCity?: string | null;
  advancePaymentRatio?: number | null;
  advancePaymentAmount?: number | null;
  prepayment?: {
    id: string;
    prepaymentAmount: number | null;
    actualAmount: number | null;
    differenceAmount: number | null;
    status: string;
    paymentStatus: string;
    deductionStatus: string;
    requestedDate: string | null;
    confirmedDate: string | null;
    deductedDate: string | null;
    paymentMethod: string | null;
    notes: string | null;
  } | null;
  customer?: {
    id: string;
    companyName?: string | null;
    address?: string | null;
    [key: string]: any;
  } | null;
  items?: Array<{
    id: string;
    salesId: string;
    containerId: string;
    containerType?: 'CONTAINER' | 'CARGO' | null;
    cargoBales?: string | number | null;
    cargoWeight?: string | number | null;
    salesUnitPrice?: string | number | null;
    margin?: string | number | null;
    status?: string | null;
    container?: {
      id: string;
      product?: string | null;
      specification?: string | null;
      [key: string]: any;
    } | null;
  }>;
  productInfo: Array<SalesProductInfo & {
    stoCost?: number | null;
    dtCost?: number | null;
    workFee?: number | null;
    advancePaymentRatio?: number | null;
  }>;
  /** sa_status (RESERVED/SOLD/COMPLETED) - 판매 확정 버튼 표시용 */
  salesStatus?: 'RESERVED' | 'SOLD' | 'COMPLETED' | null;
}

export function useSalesDetail(salesId?: string) {
  return useQuery({
    queryKey: ['sales', 'detail', salesId],
    queryFn: async () => {
      if (!salesId) return null;
      const response = await api.get(`/sales/${salesId}`);
      return response.data as SalesDetail;
    },
    enabled: !!salesId,
  });
}

export interface UpdateSalesDto extends CreateSalesDto {
  items: Array<{
    id?: string;
    containerId: string;
    containerType?: 'CONTAINER' | 'CARGO' | null;
    cargoBales?: number | null;
    cargoWeight?: number | null;
    stoCost?: number | null;
    dtCost?: number | null;
    workFee?: number | null;
    onsiteWorkFee?: number | null;
    advancePaymentRatio?: number | null;
    margin?: number | null;
    salesUnitPrice?: number | null;
    status?: string | null;
  }>;
  prepaymentCancellationMethod?: 'REFUND' | 'KEEP_FOR_NEXT' | null;
  cancellationReason?: string | null;
  /** 판매 취소 다이얼로그에서 호출 시 true (items: []여도 전체 취소로 처리) */
  isCancellation?: boolean;
}

export function useCreateSales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateSalesDto) => {
      const response = await api.post('/sales', data);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      // 하차지→선택 배송지 반영 후 고객 상세·배송지 목록 갱신
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      const cid = variables?.customerId?.trim();
      if (cid) {
        queryClient.invalidateQueries({ queryKey: ['customers', cid] });
        queryClient.invalidateQueries({ queryKey: ['customers', cid, 'delivery-addresses'] });
      }
      toast({
        title: '판매 등록 완료',
        description: '판매 정보가 성공적으로 저장되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '판매 등록 실패',
        description: message || '판매 등록 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateSales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSalesDto }) => {
      const response = await api.put(`/sales/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      const cid = variables.data?.customerId?.trim();
      if (cid) {
        queryClient.invalidateQueries({ queryKey: ['customers', cid] });
        queryClient.invalidateQueries({ queryKey: ['customers', cid, 'delivery-addresses'] });
      }
      // 선입금 목록도 갱신 (판매 취소 시 선입금 상태가 변경될 수 있음)
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
      // 판매 항목 수정 시 관련 컨테이너 재고 반영을 위해 컨테이너 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'containers'] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast({
        title: '판매 수정 완료',
        description: '판매 정보가 성공적으로 수정되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '판매 수정 실패',
        description: message || '판매 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}


export function useConfirmSales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSalesDto }) => {
      const response = await api.post(`/sales/${id}/confirm`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      const cid = variables.data?.customerId?.trim();
      if (cid) {
        queryClient.invalidateQueries({ queryKey: ['customers', cid] });
        queryClient.invalidateQueries({ queryKey: ['customers', cid, 'delivery-addresses'] });
      }
      // 채권 목록도 갱신
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      // 선입금 목록도 갱신 (선입금 상태가 DEDUCTED로 변경됨)
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
      // 판매 확정 시 관련 컨테이너 재고 반영을 위해 컨테이너 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'containers'] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast({
        title: '판매 확정 완료',
        description: '판매가 성공적으로 확정되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '판매 확정 실패',
        description: message || '판매 확정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}
