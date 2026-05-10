import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import type { CodeMaster } from '@/lib/hooks/use-code-masters';

export interface SalesReservation {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerCeo: string | null;
  bl: string | null;
  tradeOrderId: string | null;
  containerId: string | null;
  containerNo: string | null;
  orderProductNameLabel: string | null;
  contractProductName: string | null;
  contractNo: string | null;
  /** 발주 기준 입고 상태 (입고대기/예정/확정) */
  tradeOrderInboundStatus: string | null;
  containerProductCode: string | null;
  contactPhone: string | null;
  requestedQty: string | null;
  qtyUnit: string | null;
  vehicleType: string | null;
  loadingWarehouseId: number | null;
  loadingWarehouseName: string | null;
  loadingWarehouseText: string | null;
  customsDate: string | null;
  loadingDate: string | null;
  loadingScheduleNote: string | null;
  remarks: string | null;
  unitPrice: string | null;
  /** 판매 단가 구분 (SALES_PRICE_STAGE) */
  unitPriceStage: string | null;
  reference: string | null;
  sortOrder: number;
  status: string;
  registeredById: number | null;
  registeredByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetSalesReservationsParams {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: string;
  search?: string;
}

export interface GetSalesReservationsResponse {
  data: SalesReservation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type CreateSalesReservationDto = {
  customerId?: string | null;
  bl?: string | null;
  tradeOrderId?: string | null;
  containerId?: string | null;
  contactPhone?: string | null;
  requestedQty?: string | null;
  qtyUnit?: string | null;
  vehicleType?: string | null;
  loadingWarehouseId?: number | null;
  loadingWarehouseText?: string | null;
  customsDate?: string | null;
  loadingDate?: string | null;
  loadingScheduleNote?: string | null;
  remarks?: string | null;
  unitPrice?: string | null;
  unitPriceStage?: string | null;
  reference?: string | null;
  sortOrder?: number;
  status?: string;
};

export type UpdateSalesReservationDto = Partial<CreateSalesReservationDto>;

export interface BlLookupMatch {
  tradeOrderId: string;
  bl: string | null;
  bk: string | null;
  contractNo: string | null;
  productNameLabel: string | null;
  contractProductName: string | null;
  etaDate: string | null;
  /** 발주 to_customs_date (YYYY-MM-DD) */
  customsDate: string | null;
  /** 입고 행 ti_warehouse (확정 행 우선) */
  inboundWarehouse: string | null;
  /** 발주 to_sales_status 우선, 없으면 to_inbound_status */
  tradeOrderInboundStatus: string | null;
  /** 재고 목록에 포함된 컨 수 (발주 기준) */
  containerCount: number;
  totalBales: number;
  totalAvailableBales: number;
  totalReservedBales: number;
  totalCompletedBales: number;
  totalWeightMt: number;
  totalAvailableWeightMt: number;
  totalReservedWeightMt: number;
  totalCompletedWeightMt: number;
  /** TB 판매예약(tb_sales_reservation) ACTIVE 요청 합계 */
  totalSheetReservationBales: number;
  totalSheetReservationWeightMt: number;
  /** 주간재고·표와 동일 정규화 후 가용 컨 상당 */
  availableContainerEquivDisplay: number;
  containerEquivOutflow: number;
}

export interface BlLookupResponse {
  bl: string | null;
  matches: BlLookupMatch[];
}

export function useSalesReservationsList(params: GetSalesReservationsParams) {
  return useQuery<GetSalesReservationsResponse>({
    queryKey: ['sales-reservations', params],
    queryFn: async () => {
      const { data } = await api.get<GetSalesReservationsResponse>('/sales-reservations', { params });
      return data;
    },
  });
}

export function useSalesReservation(id: string | undefined) {
  return useQuery<SalesReservation>({
    queryKey: ['sales-reservations', id],
    queryFn: async () => {
      const { data } = await api.get<SalesReservation>(`/sales-reservations/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export type BlLookupInput =
  | string
  | { bl: string; excludeReservationId?: string | null };

export function useBlLookupSalesReservation() {
  return useMutation({
    mutationFn: async (input: BlLookupInput) => {
      const bl = typeof input === 'string' ? input.trim() : input.bl.trim();
      const excludeReservationId =
        typeof input === 'string'
          ? undefined
          : input.excludeReservationId?.trim() || undefined;
      const { data } = await api.get<BlLookupResponse>('/sales-reservations/bl-lookup', {
        params: {
          bl,
          ...(excludeReservationId ? { excludeReservationId } : {}),
        },
      });
      return data;
    },
  });
}

export function useCreateSalesReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateSalesReservationDto) => {
      const { data } = await api.post<SalesReservation>('/sales-reservations', body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales-reservations'] });
      toast({ title: '등록 완료', description: '판매예약이 추가되었습니다.' });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast({
        title: '등록 실패',
        description: typeof msg === 'string' ? msg : '판매예약 등록에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateSalesReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSalesReservationDto }) => {
      const { data: res } = await api.patch<SalesReservation>(`/sales-reservations/${id}`, data);
      return res;
    },
    onSuccess: (_row, vars) => {
      void qc.invalidateQueries({ queryKey: ['sales-reservations'] });
      void qc.invalidateQueries({ queryKey: ['sales-reservations', vars.id] });
      toast({ title: '저장 완료', description: '판매예약이 수정되었습니다.' });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast({
        title: '저장 실패',
        description: typeof msg === 'string' ? msg : '판매예약 수정에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteSalesReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/sales-reservations/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales-reservations'] });
      toast({ title: '삭제 완료', description: '판매예약이 삭제되었습니다.' });
    },
    onError: () => {
      toast({
        title: '삭제 실패',
        description: '판매예약 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

/** PRODUCT 코드마스터 기준: 코드(value) → 표시명(name). 이미 이름이면 유지. */
export function resolveProductDisplayNameFromCodes(
  codes: CodeMaster[],
  ...candidates: (string | null | undefined)[]
): string {
  const nt = (s: string) => s.trim();
  for (const raw of candidates) {
    if (raw == null || !String(raw).trim()) continue;
    const t = nt(String(raw));
    const byValue = codes.find((p) => nt(p.value ?? '') === t);
    if (byValue?.name?.trim()) return byValue.name.trim();
  }
  for (const raw of candidates) {
    if (raw == null || !String(raw).trim()) continue;
    const t = nt(String(raw));
    const byName = codes.find((p) => nt(p.name ?? '') === t);
    if (byName?.name?.trim()) return byName.name.trim();
  }
  for (const raw of candidates) {
    if (raw != null && String(raw).trim()) return String(raw).trim();
  }
  return '-';
}

/** 목록/상세: 발주 표시명·계약 상품명 우선, 없으면 컨테이너 상품 코드를 코드마스터 상품명으로 치환 */
export function reservationProductLabel(
  r: Pick<SalesReservation, 'orderProductNameLabel' | 'contractProductName' | 'containerProductCode'>,
  productCodes?: CodeMaster[],
): string {
  if (productCodes?.length) {
    return resolveProductDisplayNameFromCodes(
      productCodes,
      r.orderProductNameLabel,
      r.contractProductName,
      r.containerProductCode,
    );
  }
  return r.orderProductNameLabel?.trim() || r.contractProductName?.trim() || r.containerProductCode?.trim() || '-';
}
