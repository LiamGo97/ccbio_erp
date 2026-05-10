import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

/** 부킹 순번 표시: sequenceSub가 0/없으면 "7", 있으면 "7-1", "7-2" */
export function formatOrderSequence(sequence: number | null | undefined, sequenceSub?: number | null): string {
  if (sequence == null) return '-';
  const sub = sequenceSub ?? 0;
  return sub > 0 ? `${sequence}-${sub}` : String(sequence);
}

export interface TradeOrder {
  id: string;
  contractId?: string | null;
  contractNo?: string | null;
  sequence: number;
  sequenceSub?: number; // 0 = 없음, 1 이상 = 서브순번 (표시: 7-1, 7-2)
  orderCount?: number; // 계약에 속한 부킹(주문) 개수
  newOld?: string | null;
  commissionMonth?: string | null;
  commissionDollar?: string | null;
  managerUser?: {
    id: number;
    name: string;
    email: string;
  } | null;
  orderDate?: string | null;
  exportCountryCode?: string | null;
  exportCountryName?: string | null;
  exporterCode?: string | null;
  exporterName?: string | null;
  productCode?: string | null;
  productName?: string | null;
  quota?: string | null;
  fumigation?: string | null;
  spot?: string | null;
  customsDuty?: string | null;
  shippingLineCode?: string | null;
  shippingLineName?: string | null;
  shippingLine?: string | null;
  quantity?: number | null;
  grade?: string | null;
  gradeCode?: string | null;
  bk?: string | null;
  bl?: string | null;
  packingCode?: string | null;
  packingType?: string | null;
  currencyCode?: string | null;
  currencyName?: string | null;
  unitPrice?: number | null;
  totalAmount?: number | null;
  destinationCode?: string | null;
  destinationName?: string | null;
  finalDestination?: string | null;
  finalDestinationCode?: string | null;
  finalDestinationName?: string | null;
  finalDestinationArrivalDate?: string | null;
  etdText?: string | null;
  etdDate?: string | null;
  etdApi?: string | null;
  etaDate?: string | null;
  notes?: string | null;
  /** 영업 비고 (입고 확정 등, 무역 비고와 별도) */
  salesNotes?: string | null;
  /** 부킹 단계 임시 중량(MT) */
  bookingTempWeightMt?: number | null;
  /** 부킹 단계 임시 송장금액(참고) */
  bookingTempInvoiceAmount?: number | null;
  bookingTempPayments?: Array<{
    id?: string;
    sequence: number;
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    krwAmount?: number | null;
    result?: string | null;
    notes?: string | null;
  }> | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceCurrency?: string | null;
  invoiceCurrencyName?: string | null;
  invoiceAmount?: number | null;
  invoiceWeight?: number | null;
  invoiceFilePath?: string | null;
  invoiceFileName?: string | null;
  invoiceGoogleDriveFileId?: string | null;
  contractGoogleDriveFileId?: string | null;
  contractFileName?: string | null;
  contractStatus?: string | null;
  totalOrderCount?: number | null;
  certificateRequest?: string | null; // 필증신청 (기존 필드, 호환성 유지)
  certificateNumber?: string | null; // 필증번호
  hasOriginalShipment?: string | null; // 원본발송 유무 ('Y'/'N')
  originalShipment?: string | null; // 원본발송일
  doGoogleDriveFileId?: string | null; // DO 문서 Google Drive 파일 ID
  doFileName?: string | null; // DO 문서 파일명
  customsCertificateGoogleDriveFileId?: string | null; // 통관 면장 파일 Google Drive 파일 ID
  customsCertificateFileName?: string | null; // 통관 면장 파일명
  customsCertificateGoogleDriveFileId2?: string | null; // 통관 면장 파일(추가) Google Drive 파일 ID
  customsCertificateFileName2?: string | null; // 통관 면장 파일(추가) 파일명
  customsDate?: string | null; // 통관일
  customsScheduledDate?: string | null; // 통관예정일
  quarantineDate?: string | null; // 검역일
  status?: 'ORDER' | 'CONTRACT_CONFIRMED' | 'BOOKING' | 'DOCUMENTS' | 'DO' | 'ARRIVED' | 'QUARANTINE' | 'CUSTOMS' | 'COMPLETED' | null; // 기존 status 필드 (호환성 유지)
  tradeStatus?: 'BOOKING' | 'DOCUMENTS' | 'DO' | 'ARRIVED' | 'QUARANTINE' | 'CUSTOMS' | 'COMPLETED' | null; // 무역 상태
  excludeFromLogistics?: boolean; // 물류관리 목록 제외 여부
  shipBack?: boolean; // 쉽백(반송) 여부. true면 입고대기/입고예정/결재관리 목록에서 제외
  tradeStatusName?: string | null; // 무역 상태 이름 (코드명에서 변환된 이름)
  salesStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null; // 영업 상태
  financeStatus?: 'PAYMENT_PENDING' | 'PAYMENT_PROCESSING' | 'PAYMENT_COMPLETED' | null; // 재무 상태
  /** 입고관리(BL 단위) 표시용 판매예약(그리드) 합계 */
  sheetReservationBalesByBl?: number | null;
  sheetReservationWeightByBl?: number | null;
  /** 판매관리(tb) 베일 예약 폴백(BL에 중량 없을 때만). 보통은 톤으로 환산되어 weight 필드에 합산됨 */
  salesMgmtReservationBalesByBl?: number | null;
  /** 판매관리(tb) 예약 톤(MT) 합 — 베일 예약은 BL 총중량/총베일로 톤 환산 후 포함 */
  salesMgmtReservationWeightMtByBl?: number | null;
  /** 판매예약 그리드(예약등록) 컨 단위 합 */
  gridSheetReservationContainerUnits?: number | null;
  containers?: TradeContainerDto[] | null;
  payments?: Array<{
    id?: string;
    sequence: number;
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    krwAmount?: number | null;
    result?: string | null;
    paymentType?: string | null; // PAYMENT_TYPE 코드 값 (REGULAR, DO_COST, CUSTOMS_COST)
    notes?: string | null;
    useRatio?: boolean | null; // 비율 사용 여부 (기본값: true)
  }> | null;
  pendingInbound?: {
    id: string;
    warehouse?: string | null;
    igodate?: string | null;
    quarantineDate?: string | null;
    dtDate?: string | null;
    targetMargin?: number | null;
    customsFee?: number | null;
    firstTierLoadingFee?: number | null;
    doCost?: number | null;
    quarantineAgencyFee?: number | null;
    customsDuty?: number | null;
    additionalItem?: number | null;
    bankFee?: number | null;
    quarantineWorkCost?: number | null;
    spot?: number | null;
    document?: number | null;
    igobi?: number | null;
    extractionFee?: number | null;
    sto?: number | null;
    fumigationQuarantine?: number | null;
    fee?: number | null;
    sampleCollection?: number | null;
    quotaCost?: number | null;
    comparisonExchangeRate?: number | null;
    comparisonPurchaseCost?: number | null;
  } | null;
  confirmedInbound?: {
    id: string;
    warehouse?: string | null;
    igodate?: string | null;
    quarantineDate?: string | null;
    dtDate?: string | null;
    targetMargin?: number | null;
    customsFee?: number | null;
    firstTierLoadingFee?: number | null;
    doCost?: number | null;
    quarantineAgencyFee?: number | null;
    customsDuty?: number | null;
    additionalItem?: number | null;
    bankFee?: number | null;
    quarantineWorkCost?: number | null;
    spot?: number | null;
    document?: number | null;
    igobi?: number | null;
    extractionFee?: number | null;
    sto?: number | null;
    fumigationQuarantine?: number | null;
    fee?: number | null;
    sampleCollection?: number | null;
    quotaCost?: number | null;
    dayExchangeRate?: number | null;
    comparisonExchangeRate?: number | null;
    appliedExchangeRate?: number | null;
    purchaseCost?: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetTradeOrdersParams {
  userId?: number;
  contractStatus?: string | string[];
  bookingOnly?: boolean;
  status?: string; // 하위 호환성 유지 (사용 금지)
  tradeStatus?: string | string[]; // 무역 상태 필터 (단일 또는 다중)
  salesStatus?: string; // 영업 상태 필터
  financeStatus?: string; // 재무 상태 필터
  /** @deprecated 단일 상품 필터. productNames 사용 권장 */
  productName?: string;
  /** 상품(코드) 다중 선택 필터. 빈 배열이면 결과 없음, 미전달이면 필터 없음. productName이 있으면 [productName]으로 변환 */
  productNames?: string[];
  certificateRequestFilter?: string; // 필증신청 필터 (completed, pending, __all__)
  contractNo?: string; // 계약번호 필터
  /** B/K, B/L, 계약번호 검색 (백엔드 ILIKE 필터, inventory/confirmed와 동일) */
  search?: string;
  /** 날짜 기간 필터 기준: etd | eta | quarantine | customs */
  dateType?: 'etd' | 'eta' | 'quarantine' | 'customs';
  /** 날짜 기간 시작 (YYYY-MM-DD) */
  dateFrom?: string;
  /** 날짜 기간 종료 (YYYY-MM-DD) */
  dateTo?: string;
  /** 입고 확정 목록에서 전부 제외된 BL 포함 여부 (true면 제외된 BL도 표시) */
  includeOrdersWithAllContainersExcluded?: boolean;
  /** 물류관리: 제외된 주문 포함 여부 (true면 물류관리 목록에서 제외된 주문도 표시) */
  includeExcluded?: boolean;
  /** 수출사(코드) 다중 선택 필터. 빈 배열이면 결과 없음, 미전달이면 필터 없음 */
  exporters?: string[];
}

/** `useTradeOrders` / 수동 재조회 공용 — 쿼리스트링 직렬화 동일 유지 */
export async function fetchTradeOrders(
  params?: GetTradeOrdersParams,
): Promise<TradeOrder[]> {
  const searchParams = new URLSearchParams();
  if (params?.userId != null) searchParams.set('userId', String(params.userId));
  if (params?.contractStatus != null) {
    const v = params.contractStatus;
    (Array.isArray(v) ? v : [v]).forEach((s) => searchParams.append('contractStatus', s));
  }
  if (params?.bookingOnly === true) searchParams.set('bookingOnly', 'true');
  if (params?.status != null) searchParams.set('status', params.status);
  if (params?.tradeStatus != null) {
    const v = params.tradeStatus;
    (Array.isArray(v) ? v : [v]).forEach((s) => searchParams.append('tradeStatus', s));
  }
  if (params?.salesStatus != null) searchParams.set('salesStatus', params.salesStatus);
  if (params?.financeStatus != null) searchParams.set('financeStatus', params.financeStatus);
  const productNamesResolved =
    params?.productNames !== undefined
      ? params.productNames
      : params?.productName != null && params.productName !== '__all__'
        ? [params.productName]
        : undefined;
  if (productNamesResolved !== undefined) {
    if (productNamesResolved.length === 0) {
      searchParams.append('productName', '');
    } else {
      productNamesResolved.forEach((p) => searchParams.append('productName', p));
    }
  }
  if (params?.certificateRequestFilter != null) {
    searchParams.set('certificateRequestFilter', params.certificateRequestFilter);
  }
  if (params?.contractNo != null && params.contractNo.trim() !== '') {
    searchParams.set('contractNo', params.contractNo.trim());
  }
  if (params?.search != null && params.search.trim() !== '') {
    searchParams.set('search', params.search.trim());
  }
  if (params?.dateType != null) searchParams.set('dateType', params.dateType);
  if (params?.dateFrom != null) searchParams.set('dateFrom', params.dateFrom);
  if (params?.dateTo != null) searchParams.set('dateTo', params.dateTo);
  if (params?.includeOrdersWithAllContainersExcluded === true) {
    searchParams.set('includeOrdersWithAllContainersExcluded', 'true');
  }
  if (params?.includeExcluded === true) searchParams.set('includeExcluded', 'true');
  if (params?.exporters !== undefined) {
    if (params.exporters.length === 0) {
      searchParams.append('exporters', '');
    } else {
      params.exporters.forEach((e) => searchParams.append('exporters', e));
    }
  }
  const queryString = searchParams.toString();
  const url = queryString ? `/trade/contracts/orders?${queryString}` : '/trade/contracts/orders';
  const response = await api.get<TradeOrder[]>(url);
  return response.data;
}

export function useTradeOrders(params?: GetTradeOrdersParams) {
  return useQuery<TradeOrder[]>({
    queryKey: ['trade-orders', params],
    queryFn: () => fetchTradeOrders(params),
  });
}

export function useTradeOrder(id: string | undefined) {
  return useQuery<TradeOrder>({
    queryKey: ['trade-order', id],
    queryFn: async () => {
      const response = await api.get<TradeOrder>(`/trade/contracts/orders/${id}`);
      console.log('[useTradeOrder] API 응답:', {
        orderId: response.data.id,
        payments: response.data.payments,
        paymentsLength: response.data.payments?.length,
      });
      return response.data;
    },
    enabled: !!id,
  });
}

export interface TradeContainerDto {
  id?: string;
  containerNo?: string | null;
  product?: string | null;
  tradeGrade?: string | null;
  salesGrade?: string | null;
  packingType?: string | null;
  currency?: string | null;
  unitPrice?: number | null;
  weight?: number | null;
  /** 무역 베일수(문서/계약 기준) */
  tradeBales?: number | null;
  /** 영업 베일수. null이면 무역 베일과 동일 */
  salesBales?: number | null;
  /** 영업 기준 표시용(API 계산값). salesBales ?? tradeBales */
  bales?: number | null;
  /** 목록 API: 판매·예약 차감 후 가용 베일 */
  availableBales?: number | null;
  reservedBales?: number | null;
  completedBales?: number | null;
  /** 판매예약(tb_sales_reservation) ACTIVE 요청 합계 — 가용 베일/중량 차감에 반영 */
  sheetReservationBales?: number | null;
  /** listContainers: 동일 발주(BL) 기준 — 입고 화면 예약 컨 상당 분리 표시용 */
  salesMgmtReservationBalesByBl?: number | null;
  salesMgmtReservationWeightMtByBl?: number | null;
  gridSheetReservationContainerUnits?: number | null;
  /** 목록 API: 톤(MT) 기준, 표시 시 kg 환산 가능 */
  availableWeight?: number | null;
  reservedWeight?: number | null;
  completedWeight?: number | null;
  sheetReservationWeight?: number | null;
  pendingPurchaseCost?: string | null;
  confirmedPurchaseCost?: string | null;
  stoCost?: string | null;
  dtCost?: string | null;
  sequence?: number | null;
  /** 재고/입고 확정 목록에서 제외 여부 */
  excludeFromInventory?: boolean;
  /** 컨테이너 단위 쉽백(반송) 여부. 일부만 쉽백 시 사용 */
  shipBack?: boolean;
  /** 재고 상태 (가용, 예약됨 등) */
  inventoryStatus?: 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null;
}

export interface CreateTradeOrderDto {
  contractId?: string | null;
  contractNo?: string | null;
  quota?: string | null;
  fumigation?: string | null;
  spot?: string | null;
  customsDuty?: string | null;
  shipmentSeq?: number | null;
  shipmentSeqSub?: number | null;
  exportCountry?: string | null;
  exporter?: string | null;
  productName?: string | null;
  newOld?: string | null;
  commissionMonth?: string | null;
  commissionDollar?: string | null;
  orderDate?: string | null;
  shippingLine?: string | null;
  quantity?: number | null;
  grade?: string | null;
  bk?: string | null;
  bl?: string | null;
  packingType?: string | null;
  currency?: string | null;
  unitPrice?: number | null;
  totalAmount?: number | null;
  destination?: string | null;
  finalDestination?: string | null;
  finalDestinationArrivalDate?: string | null;
  etd?: string | null;
  etdApi?: string | null;
  eta?: string | null;
  notes?: string | null;
  status?: 'ORDER' | 'CONTRACT_CONFIRMED' | null;
  contractGoogleDriveFileId?: string | null;
  contractFileName?: string | null;
  totalOrderCount?: number | null;
  containers?: TradeContainerDto[] | null;
  bookingTempWeightMt?: number | null;
  bookingTempInvoiceAmount?: number | null;
  bookingTempPayments?: Array<{
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    krwAmount?: number | null;
    result?: string | null;
    notes?: string | null;
  }> | null;
}

export interface UpdateTradeOrderDto extends Partial<CreateTradeOrderDto> {
  /** 영업 비고 (입고 확정 등) */
  salesNotes?: string | null;
  invoiceDate?: string | null;
  invoiceAmount?: number | null;
  invoiceWeight?: number | null;
  invoiceGoogleDriveFileId?: string | null;
  invoiceFileName?: string | null;
  certificateRequest?: string | null; // 필증번호
  doGoogleDriveFileId?: string | null; // DO 문서 Google Drive 파일 ID
  doFileName?: string | null; // DO 문서 파일명
  customsCertificateGoogleDriveFileId?: string | null;
  customsCertificateFileName?: string | null;
  customsCertificateGoogleDriveFileId2?: string | null;
  customsCertificateFileName2?: string | null;
  customsScheduledDate?: string | null; // 통관예정일
  quarantineDate?: string | null; // 검역일
  payments?: Array<{
    id?: string;
    sequence: number;
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    krwAmount?: number | null;
    result?: string | null;
    paymentType?: string | null; // PAYMENT_TYPE 코드 값 (REGULAR, DO_COST, CUSTOMS_COST)
    notes?: string | null;
  }> | null;
  tradeStatus?: 'BOOKING' | 'DOCUMENTS' | 'DO' | 'ARRIVED' | 'QUARANTINE' | 'CUSTOMS' | 'COMPLETED' | null;
  salesStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;
  financeStatus?: 'PAYMENT_PENDING' | 'PAYMENT_PROCESSING' | 'PAYMENT_COMPLETED' | null;
  doCost?: number | null; // DO 비용 (DO 처리 상태 변경 시 재무 결제 항목으로 생성)
  shipBack?: boolean | null; // 쉽백(반송) 여부
  bookingTempWeightMt?: number | null;
  bookingTempInvoiceAmount?: number | null;
  bookingTempPayments?: Array<{
    dueDate?: string | null;
    ratio?: number | null;
    amount?: number | null;
    method?: string | null;
    exchangeRate?: number | null;
    krwAmount?: number | null;
    result?: string | null;
    notes?: string | null;
  }> | null;
}

export function useCreateTradeOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTradeOrderDto) => {
      const response = await api.post<{ success: boolean; message: string; orderId: string }>(
        '/trade/contracts/orders',
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
    },
  });
}

export function useUpdateTradeOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTradeOrderDto }) => {
      const response = await api.put(`/trade/contracts/orders/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      queryClient.invalidateQueries({ queryKey: ['trade-order', variables.id] });
    },
  });
}

export function useDeleteTradeOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/trade/contracts/orders/${id}`);
      return response.data;
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
      queryClient.invalidateQueries({ queryKey: ['trade-order', deletedId] });
      queryClient.invalidateQueries({ queryKey: ['trade-order'] });
      queryClient.invalidateQueries({ queryKey: ['trade-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['trade-contract'] });
    },
  });
}

export interface UpdateTradeContractDto {
  contractNo?: string | null;
  status?: string | null;
  contractGoogleDriveFileId?: string | null;
  contractFileName?: string | null;
}

export function useUpdateTradeContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTradeContractDto }) => {
      const response = await api.put(`/trade/contracts/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
    },
  });
}

export interface LogisticsStatusOverviewItem {
  contractId: string;
  contractNo: string;
  productName?: string | null;
  exporterName?: string | null;
  statusCounts: {
    BOOKING: number;
    DOCUMENTS: number;
    DO: number;
    CUSTOMS: number;
    ARRIVED: number;
    QUARANTINE: number;
    COMPLETED: number;
    [key: string]: number;
  };
  totalOrders: number;
  createdAt: string;
}

export function useLogisticsStatusOverview(productName?: string) {
  return useQuery<LogisticsStatusOverviewItem[]>({
    queryKey: ['logistics-status-overview', productName],
    queryFn: async () => {
      const response = await api.get<LogisticsStatusOverviewItem[]>('/trade/contracts/logistics-status-overview', {
        params: {
          ...(productName ? { productName } : {}),
        },
      });
      return response.data;
    },
  });
}

