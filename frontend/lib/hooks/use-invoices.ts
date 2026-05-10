import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Sales } from './use-sales';

export interface InvoiceItem {
  id?: string;
  order?: number;
  salesItemId?: string | null;
  productName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  amount?: number | null;
  vatAmount?: number | null;
  weight?: number | null;
  notes?: string | null;
  salesItem?: {
    id: string;
    salesId?: string | number | null;
    /** 판매 단가 구분 (LOADING/ARRIVAL/UNLOADING) — 판매관리 상품정보와 동일 */
    salesUnitPriceStage?: string | null;
    salesUnitPrice?: string | number | null;
    containerType?: string | null;
    cargoWeight?: string | number | null;
    container?: {
      id: string;
      containerNo?: string | null;
      bl?: string | null;
      weight?: string | number | null;
      /** 창고 작업비(원) */
      workFee?: string | number | null;
      onsiteWorkFee?: string | number | null;
      confirmedPurchaseCost?: string | number | null;
      pendingPurchaseCost?: string | number | null;
      order?: {
        bl?: string | null;
        inboundStatus?: string | null;
        inbounds?: Array<{
          status?: string | null;
          comparisonPurchaseCost?: string | number | null;
        }> | null;
      } | null;
      [key: string]: any;
    } | null;
    sales?: {
      id: string;
      transportFee?: string | number | null;
      customer?: {
        id: string;
        companyName?: string | null;
      } | null;
    } | null;
  } | null;
}

export interface CreateInvoiceDto {
  customerId: string;
  invoiceNumber?: string | null;
  issuedAt?: string | null;
  netWeight?: number | null;
  items: InvoiceItem[];
  notes?: string | null;
  vatApplied?: boolean;
  vatRate?: number;
  smsManagerId?: number | null;
  supplierId?: number | null;
  /** 발행 시 선택한 발행용 이름 ID */
  statementNameId?: string | null;
  /** 발행 시점 수취인 스냅샷 */
  companyName?: string | null;
  ceo?: string | null;
  phone?: string | null;
  attachmentImageUrl?: string | null;
  attachmentImagePath?: string | null;
}

export interface SalesInvoice {
  id: string;
  customerId?: string | null;
  invoiceNumber?: string | null;
  status?: 'PENDING_ISSUE' | 'ISSUED' | null;
  netWeight?: number | null;
  invoiceAmount?: number | null;
  subtotal?: number | null;
  vatAmount?: number | null;
  vatApplied?: boolean;
  vatRate?: number;
  issuedAt?: string | null;
  issuedBy?: number | null;
  issuedByUser?: {
    id: number;
    name: string;
  } | null;
  smsManagerId?: number | null;
  smsManager?: {
    id: number;
    name: string;
    phone?: string | null;
  } | null;
  supplierId?: number | null;
  supplier?: {
    id: number;
    businessRegistrationNumber: string;
    representativeName: string;
    companyName: string;
    address: string;
    tel: string;
    status: boolean;
  } | null;
  notes?: string | null;
  items?: InvoiceItem[];
  totalQuantity?: number | null; // 총 수량 (백엔드에서 계산)
  previousBalance?: number | null; // 전일잔액 (발행 시점의 전일잔액)
  customer?: {
    id: string;
    companyName?: string | null;
    phone?: string | null;
    ceo?: string | null;
  } | null;
  /** 발행 시점 수취인 스냅샷 (우선 사용) */
  statementNameId?: string | null;
  companyName?: string | null;
  ceo?: string | null;
  phone?: string | null;
  /** MMS·첨부 이미지 (버킷) */
  attachmentImageUrl?: string | null;
  attachmentImagePath?: string | null;
  // SMS 발송 상태 정보
  smsStatus?: string | null; // 'SENT' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'NOT_APPLICABLE' | null
  smsSentAt?: string | null;
  smsResultMessage?: string | null;
  smsNotApplicable?: boolean; // SMS 해당없음 (발송 안 하는 업체 등)
  // 이카운트 ERP 처리 상태 정보
  ecountProcessingStatus?: string | null; // 'NOT_PROCESSED' | 'PROCESSED' | 'NOT_APPLICABLE'
  ecountProcessedAt?: string | null;
  ecountProcessedBy?: number | null;
  ecountProcessedByUser?: {
    id: number;
    name: string;
  } | null;
  /** 연결된 판매가 취소된 경우 true (목록에서 배지 표시용) */
  salesCancelled?: boolean;
  /** 거래명세서 취소(소프트삭제)된 경우 true */
  invoiceCancelled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SalesItem {
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
    [key: string]: any;
  } | null;
}

export interface PendingInvoiceSales extends Sales {
  invoiceStatus?: 'PENDING_ISSUE' | 'ISSUED' | null;
  customer?: {
    id: string;
    companyName?: string | null;
  } | null;
  items?: SalesItem[];
  delivery?: {
    id: string;
    status?: string | null;
    unloadingDateTime?: string | null;
  } | null;
}

export interface GetPendingInvoicesParams {
  page?: number;
  limit?: number;
  search?: string;
  /** 단일 SMS 필터 (하위 호환). `smsStatuses`가 지정되면 무시 */
  smsStatus?: string;
  smsStatuses?: string[];
  /** 단일 이카운트 필터 (하위 호환). `ecountProcessingStatuses`가 지정되면 무시 */
  ecountProcessingStatus?: string;
  ecountProcessingStatuses?: string[];
  issuedAtStartDate?: string;
  issuedAtEndDate?: string;
  /** 단일 공급자 (하위 호환). `supplierIds`가 지정되면 무시 */
  supplierId?: number; // 0 = 미지정, >0 = 특정 공급자
  supplierIds?: number[];
  /** true면 취소/판매취소 건 제외. 전달하지 않으면 전체 표시 */
  excludeCancelled?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** 발행 목록 전용 — 다중 필터는 반복 쿼리로 전달 */
export async function fetchIssuedInvoices(params: GetPendingInvoicesParams = {}) {
  const sp = new URLSearchParams();
  if (params.page != null) sp.set('page', String(params.page));
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.search?.trim()) sp.set('search', params.search.trim());
  if (params.issuedAtStartDate) sp.set('issuedAtStartDate', params.issuedAtStartDate);
  if (params.issuedAtEndDate) sp.set('issuedAtEndDate', params.issuedAtEndDate);
  if (params.excludeCancelled) sp.set('excludeCancelled', 'true');
  if (params.sortBy) sp.set('sortBy', params.sortBy);
  if (params.sortOrder) sp.set('sortOrder', params.sortOrder);

  if (params.smsStatuses !== undefined) {
    if (params.smsStatuses.length === 0) sp.append('smsStatuses', '');
    else params.smsStatuses.forEach((s) => sp.append('smsStatuses', s));
  } else if (params.smsStatus) {
    sp.set('smsStatus', params.smsStatus);
  }

  if (params.ecountProcessingStatuses !== undefined) {
    if (params.ecountProcessingStatuses.length === 0) sp.append('ecountProcessingStatuses', '');
    else params.ecountProcessingStatuses.forEach((s) => sp.append('ecountProcessingStatuses', s));
  } else if (params.ecountProcessingStatus) {
    sp.set('ecountProcessingStatus', params.ecountProcessingStatus);
  }

  if (params.supplierIds !== undefined) {
    if (params.supplierIds.length === 0) sp.append('supplierIds', '');
    else params.supplierIds.forEach((id) => sp.append('supplierIds', String(id)));
  } else if (params.supplierId !== undefined && params.supplierId !== null) {
    sp.set('supplierId', String(params.supplierId));
  }

  const qs = sp.toString();
  const response = await api.get(`/sales/invoices/issued${qs ? `?${qs}` : ''}`);
  return response.data as {
    data: SalesInvoice[];
    total: number;
    page: number;
    lastPage: number;
  };
}

export interface GetAvailableSalesItemsParams {
  page?: number;
  limit?: number;
  search?: string;
  product?: string;
  salesId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AvailableSalesItem {
  id: string;
  itemId?: string; // 판매 항목 ID (tb_sales_item.si_id)
  salesId: string;
  containerId?: string | null;
  sequence?: number | null;
  productName: string;
  specification?: string | null;
  weight?: number | null;
  cargoWeight?: number | null;
  unitPrice?: number | null;
  containerNo?: string | null;
  bl?: string | null;
  packingType?: string | null;
  packingName?: string | null;
  exporter?: string | null;
  exporterName?: string | null;
  tradeGrade?: string | null;
  tradeGradeName?: string | null;
  salesGrade?: string | null;
  salesGradeName?: string | null;
  containerType?: 'CONTAINER' | 'CARGO';
  bales?: number | null;
  salesBales?: number | null; // 영업 베일
  tradeBales?: number | null; // 무역 베일
  cargoBales?: number | null;
  margin?: number | null;
  exchangeRate?: number | null;
  etaDate?: string | null;
  inboundStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;
  inboundWarehouse?: string | null;
  inboundWarehouseName?: string | null;
  salesDate?: string | null;
  deliveryOrderNumber?: string | null;
  sales?: {
    id: string;
    customer?: {
      id: string;
      companyName?: string | null;
      phone?: string | null;
      ceo?: string | null;
    } | null;
  };
}

export function usePendingInvoices(params: GetPendingInvoicesParams = {}) {
  return useQuery({
    queryKey: ['invoices', 'pending', params],
    queryFn: async () => {
      const response = await api.get('/sales/invoices/pending', { params });
      return response.data as {
        data: PendingInvoiceSales[];
        total: number;
        page: number;
        lastPage: number;
      };
    },
  });
}

export function useIssuedInvoices(params: GetPendingInvoicesParams = {}) {
  return useQuery({
    queryKey: ['invoices', 'issued', params],
    queryFn: () => fetchIssuedInvoices(params),
  });
}

export function useInvoice(invoiceId?: string) {
  return useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      const response = await api.get(`/sales/invoices/${invoiceId}`);
      return response.data as SalesInvoice;
    },
    enabled: !!invoiceId,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateInvoiceDto) => {
      const response = await api.post('/sales/invoices', data);
      return response.data as SalesInvoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      // 거래명세서 생성 시 선입금 차감 및 채권 생성되므로 관련 데이터도 갱신
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({
        title: '거래명세서 발행 완료',
        description: '거래명세서가 성공적으로 발행되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '거래명세서 발행 실패',
        description: message || '거래명세서 발행 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreateInvoiceDto }) => {
      const response = await api.put(`/sales/invoices/${id}`, data);
      return response.data as SalesInvoice;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      // 거래명세서 수정 시 선입금/채권 데이터도 갱신될 수 있으므로 갱신
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({
        title: '거래명세서 수정 완료',
        description: '거래명세서가 성공적으로 수정되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '거래명세서 수정 실패',
        description: message || '거래명세서 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useAvailableSalesItems(params: GetAvailableSalesItemsParams = {}) {
  return useQuery({
    queryKey: ['invoices', 'available-items', params],
    queryFn: async () => {
      const response = await api.get('/sales/invoices/available-items', { params });
      return response.data as {
        data: AvailableSalesItem[];
        total: number;
        page: number;
        lastPage: number;
      };
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/sales/invoices/${id}`);
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({
        title: '거래명세서 발행 취소 완료',
        description: '거래명세서 발행이 취소되었고, 채권에서 해당 금액이 차감되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '거래명세서 발행 취소 실패',
        description: message || '거래명세서 발행 취소 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

/** 임시: 거래명세서 발행일만 수정 (채권 상세 등에서 사용) */
export function useUpdateInvoiceIssuedAt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, issuedAt }: { invoiceId: string; issuedAt: string }) => {
      const response = await api.patch(`/sales/invoices/${invoiceId}/issued-at`, { issuedAt });
      return response.data as SalesInvoice;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivable'] });
      // 채권 목록(명세서 발행일 컬럼) 및 거래처관리대장 즉시 반영
      queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
      toast({
        title: '발행일 수정 완료',
        description: '거래명세서 발행일이 변경되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '발행일 수정 실패',
        description: message || '발행일 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateInvoiceEcountProcessingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      status,
    }: {
      invoiceId: string;
      status: 'PROCESSED' | 'NOT_PROCESSED' | 'NOT_APPLICABLE';
    }) => {
      const response = await api.patch(`/sales/invoices/${invoiceId}/ecount-processing-status`, { status });
      return response.data as SalesInvoice;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
      toast({
        title: '처리 완료',
        description: '이카운트 ERP 처리 상태가 업데이트되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '처리 실패',
        description: message || '이카운트 ERP 처리 상태 업데이트 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateInvoiceSmsNotApplicable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      smsNotApplicable,
    }: { invoiceId: string; smsNotApplicable: boolean }) => {
      const response = await api.patch(`/sales/invoices/${invoiceId}/sms-not-applicable`, {
        smsNotApplicable,
      });
      return response.data as SalesInvoice;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
      toast({
        title: '저장됨',
        description: 'SMS 해당없음 설정이 변경되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast({
        title: '변경 실패',
        description: message || 'SMS 해당없음 설정 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

