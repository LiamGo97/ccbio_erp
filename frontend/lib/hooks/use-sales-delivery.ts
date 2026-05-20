import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface SalesDeliveryLoadingItem {
  id: string;
  salesDeliveryId: string;
  salesItemId: string;
  salesItem?: {
    id: string;
    containerId: string;
    containerType?: 'CONTAINER' | 'CARGO' | null;
    cargoBales?: string | null;
    cargoWeight?: string | null;
    container?: {
      id: string;
      containerNo?: string | null;
      product?: string | null;
      bales?: string | null;
      salesBales?: number | string | null;
      tradeBales?: number | string | null;
      weight?: string | null;
      sequence?: number | null;
      order?: {
        id: string;
        bl?: string | null;
        inboundStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;
        inbounds?: Array<{
          id: string;
          warehouse?: string | number | null;
        }>;
      } | null;
    } | null;
  } | null;
  loadingSchedule?: string | null;
  loadingScheduleTime?: string | null;
  loadingWarehouseId?: number | null;
  loadingWarehouse?: {
    id: number;
    name: string;
  } | null;
  // 요청 정보 (판매 시점의 요청 정보, 이력 관리용)
  requestBL?: string | null;
  requestContainer?: string | null;
  requestContainerType?: 'CONTAINER' | 'CARGO' | null;
  requestBales?: number | null;
  requestWeight?: number | null;
  requestNotes?: string | null;
  // 작업 정보 (상차 업체가 입력하는 실제 작업 정보)
  workBL?: string | null;
  workContainer?: string | null;
  workContainerType?: 'CONTAINER' | 'CARGO' | null;
  workBales?: number | null;
  workWeight?: number | null;
  notes?: string | null;
  // 실제 처리 정보 (하차완료 확인 시 입력)
  actualBL?: string | null;
  actualContainer?: string | null;
  actualContainerType?: 'CONTAINER' | 'CARGO' | null;
  actualBales?: number | null;
  actualWeight?: number | null;
  status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';
  order?: number;
  /** 거래명세서 발행 완료 여부 (백엔드에서 조회 후 세팅) */
  invoiceIssued?: boolean;
  /** 표시용 컨테이너(실제→작업→요청)에 해당하는 순번. 백엔드에서 컨테이너 FK로 채움 */
  displayContainerSequence?: number | null;
  /** 요청 컨테이너 순번. 백엔드에서 컨테이너 FK로 채움 */
  requestContainerSequence?: number | null;
  /** 작업 컨테이너 순번. 백엔드에서 컨테이너 FK로 채움 */
  workContainerSequence?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 상차 업체가 작성한 작업 라인 (비고는 sdwl_notes) */
export interface SalesDeliveryWorkLine {
  id: string;
  salesDeliveryId: string;
  warehouseId?: number | null;
  workBL?: string | null;
  workContainer?: string | null;
  workContainerType?: 'CONTAINER' | 'CARGO' | null;
  workBales?: number | null;
  workWeight?: number | null;
  notes?: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesDelivery {
  id: string;
  salesId: string;
  sales?: {
    id: string;
    customerId?: string | null;
    salesDate?: string | null;
    reservationDate?: string | null;
    /** 판매(tb_sales) 하차지 분할 주소 — 배송 행과 별도일 수 있음 */
    unloadingPostalCode?: string | null;
    unloadingAddress?: string | null;
    unloadingAddressDetail?: string | null;
    unloadingAddressRoad?: string | null;
    unloadingAddressJibun?: string | null;
    unloadingLegalBCode?: string | null;
    unloadingAddressDefaultType?: string | null;
    /** 판매 등록/수정 시 입력한 비고 (tb_sales.sa_notes) */
    notes?: string | null;
    customer?: {
      id: string;
      companyName?: string | null;
      ceo?: string | null;
      phone?: string | null;
      postalCode?: string | null;
      address?: string | null;
      addressDetail?: string | null;
      addressRoad?: string | null;
      addressJibun?: string | null;
      addressDefaultType?: string | null;
      legalBCode?: string | null;
      regionId?: number | null;
      regionEntity?: {
        id: number;
        name: string;
      } | null;
      cityId?: number | null;
      cityEntity?: {
        id: number;
        name: string;
      } | null;
    } | null;
  } | null;
  status?: string;
  orderNumber?: string | null;
  requestVehicle?: string | null;
  requestWeight?: string | null;
  unloadingPostalCode?: string | null;
  unloadingAddress?: string | null;
  unloadingAddressDetail?: string | null;
  unloadingRegionId?: number | null;
  unloadingRegion?: {
    id: number;
    name: string;
  } | null;
  unloadingCityId?: number | null;
  unloadingCity?: {
    id: number;
    name: string;
  } | null;
  unloadingScheduleDate?: string | null;
  unloadingScheduleTime?: string | null;
  dispatchCompanyId?: number | null;
  dispatchCompany?: {
    id: number;
    name: string;
  } | null;
  unloadingCompanyId?: number | null;
  unloadingCompany?: {
    id: number;
    representativeName: string;
    contact: string;
  } | null;
  /** 직접 하차 선택 시 연락처 */
  directUnloadingContact?: string | null;
  vehicleNumber?: string | null;
  driverContact?: string | null;
  driverName?: string | null;
  entryTime?: string | null;
  loadingDateTime?: string | null;
  unloadingDateTime?: string | null;
  transportFee?: number | null;
  weighingFee?: number | null;
  freightPaymentType?: string | null;
  /** 운송비 지급 상태 (UNPAID/PAID) */
  transportFeePaymentStatus?: string | null;
  /** 하차완료 시 계근증 관련 텍스트 */
  weighingCertInfo?: string | null;
  /** 하차완료 시 계근증 이미지 경로 (GCS 버킷 내부 경로 JSON 배열) */
  weighingCertImagePaths?: string | null;
  notes?: string | null;
  statusReason?: string | null;
  reprocessReason?: string | null;
  createdBy?: number | null;
  createdByUser?: {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  loadingItems?: SalesDeliveryLoadingItem[];
  workLines?: SalesDeliveryWorkLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalesDeliveryDto {
  salesId: string;
  requestVehicle?: string | null;
  requestWeight?: string | null;
  loadingWarehouseId?: number;
  loadingSchedule?: string;
  loadingScheduleTime?: string;
  unloadingPostalCode?: string;
  unloadingAddress?: string;
  unloadingAddressDetail?: string;
  unloadingAddressRoad?: string;
  unloadingAddressJibun?: string;
  unloadingLegalBCode?: string;
  unloadingAddressDefaultType?: string;
  unloadingRegion?: string;
  unloadingCity?: string;
  unloadingScheduleDate?: string;
  unloadingScheduleTime?: string;
  freightPaymentType?: string;
  companyName?: string;
  representativeName?: string;
  phone?: string;
  requestBL?: string;
  requestContainer?: string;
  dispatchCompanyId?: number | null;
  unloadingCompanyId?: number | null;
  directUnloadingContact?: string | null;
  vehicleNumber?: string | null;
  driverContact?: string | null;
  driverName?: string | null;
  entryTime?: string | null;
  loadingDateTime?: string | null;
  unloadingDateTime?: string | null;
  transportFee?: number | null;
  loadingItems?: {
    id?: string;
    salesItemId?: string;
    /** 하차 시 추가 상차 행: 원본 판매행 id (salesItemId 없이 전달 시 백엔드가 먼저 SalesItem 생성) */
    parentSalesItemId?: string;
    loadingSchedule?: string;
    loadingScheduleTime?: string;
    loadingWarehouseId?: number;
    requestBL?: string;
    requestContainer?: string;
    requestContainerType?: string;
    requestBales?: number;
    requestWeight?: number;
    requestNotes?: string;
    workBL?: string;
    workContainer?: string;
    workContainerType?: string;
    workBales?: number;
    workWeight?: number;
    actualBL?: string;
    actualContainer?: string;
    /** 컨테이너 ID (동일 containerNo·다른 순번 [1]/[2] 구분용) */
    actualContainerId?: string;
    actualContainerType?: string;
    actualBales?: number;
    actualWeight?: number;
    status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';
    order?: number;
    notes?: string;
  }[];
  status?: string;
  /** 특정 고객 배송지 행에만 하차지 반영 시 ID */
  unloadingDeliveryAddressId?: string | null;
  /** false면 판매 하차지만 갱신하고 고객 대표 주소는 동기화하지 않음 */
  unloadingMirrorToCustomerDefault?: boolean;
}

export interface UpdateSalesDeliveryDto extends Partial<CreateSalesDeliveryDto> {
  weighingFee?: number | null;
  statusReason?: string;
  reprocessReason?: string;
  /** true면 상차 작업 내용을 work_line 테이블에 동기화. 상차 업체 수정 시에만 true */
  syncWorkLine?: boolean;
  /** 하차완료 확인 시 "행 삭제"한 상차 항목 ID. 행은 유지하고 실제 확정만 null로 두어 재고 반영만 제외 */
  removedLoadingItemIds?: string[];
  /** 운송비 지급 상태 (UNPAID/PAID) */
  transportFeePaymentStatus?: string;
  /** 하차완료 시 계근증 관련 텍스트 */
  weighingCertInfo?: string | null;
  /** 하차완료 시 계근증 이미지 경로 (GCS 버킷 내부 경로 JSON 배열) */
  weighingCertImagePaths?: string | null;
}

interface SalesDeliveriesResponse {
  data: SalesDelivery[];
  total: number;
  page: number;
  lastPage: number;
}

interface UseSalesDeliveriesParams {
  salesId?: string;
  /** 단일 상태 (하위 호환) */
  status?: string;
  /** 다중 상태 필터 (배열로 전달 시 status 대신 사용) */
  statuses?: string[];
  search?: string;
  /** 다중 배차업체 필터 (빈 배열이면 선택 안 함 = 결과 없음) */
  dispatchCompanyIds?: number[] | '__none__';
  /** 다중 상차업체(창고) 필터 (빈 배열이면 선택 안 함 = 결과 없음) */
  loadingWarehouseIds?: number[] | '__none__';
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  enabled?: boolean; // 쿼리 활성화 여부
}

function buildDeliveriesListApiParams(
  queryParams: Omit<UseSalesDeliveriesParams, 'enabled'>,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...queryParams };
  if (params.statuses && Array.isArray(params.statuses) && params.statuses.length > 0) {
    params.status = params.statuses;
    delete params.statuses;
  }
  if (params.dispatchCompanyIds !== undefined) {
    if (params.dispatchCompanyIds === '__none__') {
      params.dispatchCompanyId = '__none__';
    } else if (Array.isArray(params.dispatchCompanyIds) && params.dispatchCompanyIds.length > 0) {
      params.dispatchCompanyId = params.dispatchCompanyIds;
    }
    delete params.dispatchCompanyIds;
  }
  if (params.loadingWarehouseIds !== undefined) {
    if (params.loadingWarehouseIds === '__none__') {
      params.loadingWarehouseId = '__none__';
    } else if (Array.isArray(params.loadingWarehouseIds) && params.loadingWarehouseIds.length > 0) {
      params.loadingWarehouseId = params.loadingWarehouseIds;
    }
    delete params.loadingWarehouseIds;
  }
  return params;
}

export type UseSalesDeliveriesAllParams = Omit<UseSalesDeliveriesParams, 'page' | 'limit'>;

const DELIVERIES_ALL_PAGE_SIZE = 200;

/** 페이지를 순회하며 운송 목록 전체를 조회 (기사별 운송 등) */
/** 기사별 운송 API 응답 — 경량 요약 */
export interface DriverDeliverySummary {
  id: string;
  orderNumber?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverContact?: string | null;
  transportFee?: number | null;
  status?: string | null;
  /** 상차 항목 기준 — CARGO,CONTAINER 등 (혼합 시 콤마 구분) */
  loadingContainerTypes?: string | null;
  unloadingAddressDetail?: string | null;
  sales?: {
    unloadingAddressRoad?: string | null;
    unloadingAddressJibun?: string | null;
    unloadingAddress?: string | null;
    unloadingAddressDetail?: string | null;
  } | null;
}

export interface DriverDeliveryGroup {
  key: string;
  vehicleNumber: string;
  driverName: string;
  driverContact: string;
  label: string;
  deliveryCount: number;
  transportFeeSum: number;
  deliveries: DriverDeliverySummary[];
}

export interface DriverDeliveryGroupsResponse {
  groups: DriverDeliveryGroup[];
  totalDeliveries: number;
  totalDrivers: number;
}

export function useSalesDeliveriesByDriver(search?: string) {
  const searchKey = search?.trim() || '';
  return useQuery<DriverDeliveryGroupsResponse, Error>({
    queryKey: ['deliveries', 'by-driver', searchKey],
    queryFn: async () => {
      const response = await api.get<DriverDeliveryGroupsResponse>('/deliveries/by-driver', {
        params: searchKey ? { search: searchKey } : undefined,
      });
      return response.data;
    },
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: true,
  });
}

export function useSalesDeliveriesAll(params?: UseSalesDeliveriesAllParams) {
  const { enabled, ...queryParams } = params || {};

  return useQuery<SalesDeliveriesResponse, Error>({
    queryKey: ['sales-deliveries', 'all', queryParams],
    queryFn: async () => {
      const baseParams = buildDeliveriesListApiParams(queryParams);
      const all: SalesDelivery[] = [];
      let page = 1;
      let lastPage = 1;

      do {
        const response = await api.get<SalesDeliveriesResponse>('/deliveries', {
          params: {
            ...baseParams,
            page,
            limit: DELIVERIES_ALL_PAGE_SIZE,
          },
        });
        const body = response.data;
        all.push(...(body.data ?? []));
        lastPage = body.lastPage && body.lastPage > 0 ? body.lastPage : 1;
        page += 1;
      } while (page <= lastPage);

      return {
        data: all,
        total: all.length,
        page: 1,
        lastPage: 1,
      };
    },
    enabled: enabled !== false,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: true,
  });
}

export function useSalesDeliveries(params?: UseSalesDeliveriesParams, options?: { refetchInterval?: number }) {
  const { enabled, ...queryParams } = params || {};
  
  return useQuery<SalesDeliveriesResponse, Error>({
    queryKey: ['sales-deliveries', queryParams],
    queryFn: async () => {
      try {
        const params = buildDeliveriesListApiParams(queryParams);
        const response = await api.get('/deliveries', { params });
        return response.data;
      } catch (error: any) {
        console.error('[useSalesDeliveries] API 호출 실패:', error);
        throw error;
      }
    },
    enabled: enabled !== false, // enabled가 false가 아니면 활성화 (기본값: true)
    placeholderData: (previousData) => previousData,
    refetchInterval: options?.refetchInterval, // 자동 갱신 간격 (밀리초)
    refetchIntervalInBackground: false, // 백그라운드에서는 중지 (비용 절감)
    refetchOnWindowFocus: true, // 탭 활성화 시 즉시 갱신
  });
}

export function useSalesDelivery(id: string | null) {
  return useQuery<SalesDelivery, Error>({
    queryKey: ['sales-delivery', id],
    queryFn: async () => {
      if (!id) throw new Error('Sales Delivery ID is required');
      const response = await api.get(`/deliveries/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateSalesDelivery() {
  const queryClient = useQueryClient();
  return useMutation<SalesDelivery, Error, CreateSalesDeliveryDto>({
    mutationFn: async (newDelivery) => {
      const response = await api.post('/deliveries', newDelivery);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales-deliveries'] });
    },
  });
}

export function useUpdateSalesDelivery() {
  const queryClient = useQueryClient();
  return useMutation<SalesDelivery, Error, { id: string; data: UpdateSalesDeliveryDto }>({
    mutationFn: async ({ id, data }) => {
      const response = await api.put(`/deliveries/${id}`, data);
      return response.data;
    },
    onSuccess: (updatedDelivery, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['sales-deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['deliveries', 'by-driver'] });
      void queryClient.invalidateQueries({ queryKey: ['sales-delivery', id] });
      if (updatedDelivery?.salesId) {
        void queryClient.invalidateQueries({ queryKey: ['sales', 'detail', updatedDelivery.salesId] });
        void queryClient.invalidateQueries({ queryKey: ['sales'] });
      }
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      const cid =
        updatedDelivery?.sales?.customerId ?? updatedDelivery?.sales?.customer?.id;
      if (cid) {
        void queryClient.invalidateQueries({ queryKey: ['customers', cid, 'delivery-addresses'] });
      }
      // 하차완료로 변경/수정 시 거래명세서 관리 발행대기·판매항목선택 목록 갱신
      if (updatedDelivery?.status === 'UNLOADING_COMPLETED') {
        void queryClient.invalidateQueries({ queryKey: ['invoices', 'available-items'] });
        void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    },
  });
}

export function useDeleteSalesDelivery() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`/deliveries/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales-deliveries'] });
    },
  });
}

