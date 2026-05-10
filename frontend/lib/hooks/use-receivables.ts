import { useQuery, useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ReceivableListItem {
  id: string;
  invoiceId: string | null;
  customerId: string;
  customerName: string | null;
  invoiceNumber: string | null;
  occurredDate: string;
  receivableAmount: number;
  outstandingAmount: number;
  collectedAmount: number;
  balance: number;
  status: string;
  warningStatus: string | null;
  createdAt: string;
}

export interface ReceivableDetail {
  id: string;
  invoiceId: string | null;
  customerId: string;
  customerName: string | null;
  invoiceNumber: string | null;
  occurredDate: string;
  receivableAmount: number;
  prepaymentDeducted: number;
  outstandingAmount: number;
  collectedAmount: number;
  balance: number;
  status: string;
  warningStatus: string | null;
  notes: string | null;
  paymentTermsType?: 'DAYS' | 'THIS_MONTH_DAY' | 'NEXT_MONTH_DAY' | 'THIS_MONTH_END' | 'NEXT_MONTH_END';
  paymentTermsValue?: number | null;
  lastPaymentDueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivableCollectionItem {
  id: string;
  collectionAmount: number;
  collectionDate: string;
  collectionMethod: string | null;
  notes: string | null;
  isPrepayment: boolean;
  createdAt: string;
}

export interface GetReceivablesParams {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: string;
  warningStatus?: string;
}

export interface GetReceivablesResponse {
  data: ReceivableListItem[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export function useReceivables(params?: GetReceivablesParams) {
  return useQuery<GetReceivablesResponse>({
    queryKey: ['receivables', params],
    queryFn: async () => {
      const response = await api.get<GetReceivablesResponse>('/receivables', { params });
      return response.data;
    },
  });
}

export function useReceivable(id?: string) {
  return useQuery<ReceivableDetail>({
    queryKey: ['receivable', id],
    queryFn: async () => {
      if (!id) throw new Error('Receivable ID is required');
      const response = await api.get<ReceivableDetail>(`/receivables/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useReceivableCollections(receivableId?: string) {
  return useQuery<ReceivableCollectionItem[]>({
    queryKey: ['receivable-collections', receivableId],
    queryFn: async () => {
      if (!receivableId) throw new Error('Receivable ID is required');
      const response = await api.get<ReceivableCollectionItem[]>(`/receivables/${receivableId}/collections`);
      return response.data;
    },
    enabled: !!receivableId,
  });
}

export interface UpdateCollectionParams {
  receivableId: string;
  collectionId: string;
  collectionAmount: number;
  collectionDate: string;
  collectionMethod?: string | null;
  notes?: string | null;
  isPrepayment?: boolean;
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation<ReceivableDetail, Error, UpdateCollectionParams>({
    mutationFn: async ({ receivableId, collectionId, ...dto }) => {
      const response = await api.put<ReceivableDetail>(
        `/receivables/${receivableId}/collections/${collectionId}`,
        dto,
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receivable', variables.receivableId] });
      queryClient.invalidateQueries({ queryKey: ['receivable-collections', variables.receivableId] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation<ReceivableDetail, Error, { receivableId: string; collectionId: string }>({
    mutationFn: async ({ receivableId, collectionId }) => {
      const response = await api.delete<ReceivableDetail>(
        `/receivables/${receivableId}/collections/${collectionId}`,
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receivable', variables.receivableId] });
      queryClient.invalidateQueries({ queryKey: ['receivable-collections', variables.receivableId] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
    },
  });
}

export interface CustomerWithReceivable {
  customerId: string;
  companyName: string | null;
  ceo: string | null;
  phone: string | null;
  customerType: string | null;
  balance: number;
  receivableId: string;
  /** 채권 메모 (tb_accounts_receivable.ar_notes) */
  receivableNotes?: string | null;
  warningStatus: string | null;
  occurredDate: string;
  smsExcluded: boolean;
  lastPaymentDueDate: string | null;
  paymentTermsType: 'DAYS' | 'THIS_MONTH_DAY' | 'NEXT_MONTH_DAY' | 'THIS_MONTH_END' | 'NEXT_MONTH_END';
  paymentTermsValue: number | null;
  dDay: number | null; // 음수면 D-DAY (아직 안 지남), 양수면 경과일
  salesManagerName?: string | null;
  salesManagerEmail?: string | null;
  supplierId?: number | null;
  supplierCompanyName?: string | null;
}

export interface GetCustomersWithReceivablesParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  warningStatus?: (string | null)[];
  excludeZeroBalance?: boolean;
  /**
   * 계산 잔액(거래처관리대장 기준) 구간 다중 선택.
   * RECEIVABLE=잔액>0(채권), ZERO=0원, PREPAYMENT=잔액<0(선수금). 없거나 3종 전부면 필터 없음.
   */
  balanceCategories?: string[];
  /** 계산 잔액이 이 값 미만인 거래처 제외 (채권관리·대시보드 등) */
  minReceivableBalance?: number;
  /** 고객 구분: FARM(농가), DISTRIBUTION(유통). 없으면 전체 */
  customerType?: string;
  /** 공급자 다중 선택: [0]=공급자 없음, [1,2]=특정 공급자들. undefined=필터 없음(전체) */
  supplierIds?: number[];
  /** 결제조건일 기준 ~ 이 날짜 이하만 조회 (YYYY-MM-DD). 입금예상액 등에서 사용 */
  dueDateLte?: string;
}

export interface GetCustomersWithReceivablesResponse {
  data: CustomerWithReceivable[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
  totalBalance?: number; // 필터 적용된 전체 데이터의 잔액 합계 (페이지 구분 없음)
}

export interface MonthlyReceivablesSummary {
  amount: number;
}

export function useMonthlyReceivablesSummary(year?: number, month?: number) {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;

  return useQuery<MonthlyReceivablesSummary>({
    queryKey: ['receivables-summary-monthly', y, m],
    queryFn: async () => {
      const response = await api.get<MonthlyReceivablesSummary>(
        '/receivables/summary/monthly',
        { params: { year: y, month: m } },
      );
      return response.data;
    },
  });
}

/** 채권 목록 API 파라미터 직렬화 (supplierIds, warningStatus 배열 NestJS 호환) */
export function serializeReceivablesParams(p: Record<string, unknown> | object): string {
  const sp = new URLSearchParams();
  Object.entries(p).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => sp.append(key, String(v)));
    } else {
      sp.append(key, String(value));
    }
  });
  return sp.toString();
}

export function useCustomersWithReceivables(params?: GetCustomersWithReceivablesParams) {
  return useQuery<GetCustomersWithReceivablesResponse>({
    queryKey: ['customers-with-receivables', params],
    queryFn: async () => {
      const response = await api.get<GetCustomersWithReceivablesResponse>(
        '/receivables/customers/with-receivables',
        {
          params: params ?? {},
          paramsSerializer: serializeReceivablesParams,
        },
      );
      return response.data;
    },
  });
}

/** 기준일 이하 잔액 목록 (입금예상액): 결제조건일·수금일 ≤ cutoffDate 인 건만 합산한 잔액 */
export interface GetCustomersWithBalanceByCutoffParams {
  cutoffDate: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  customerType?: string;
  supplierIds?: number[];
  excludeZeroBalance?: boolean;
}

export function useCustomersWithBalanceByCutoff(params?: GetCustomersWithBalanceByCutoffParams | null) {
  return useQuery<GetCustomersWithReceivablesResponse>({
    queryKey: ['customers-balance-by-cutoff', params],
    queryFn: async () => {
      if (!params?.cutoffDate) {
        return { data: [], total: 0, page: 1, limit: 20, lastPage: 1 };
      }
      const response = await api.get<GetCustomersWithReceivablesResponse>(
        '/receivables/customers/balance-by-cutoff',
        {
          params: {
            cutoffDate: params.cutoffDate,
            page: params.page ?? 1,
            limit: params.limit ?? 20,
            sortBy: params.sortBy,
            sortOrder: params.sortOrder,
            search: params.search,
            customerType: params.customerType,
            supplierIds: params.supplierIds,
            excludeZeroBalance: params.excludeZeroBalance ?? true,
          },
          paramsSerializer: serializeReceivablesParams,
        },
      );
      return response.data;
    },
    enabled: !!params?.cutoffDate,
  });
}

export interface UpdatePaymentTermsParams {
  receivableId: string;
  paymentTermsType: 'DAYS' | 'THIS_MONTH_DAY' | 'NEXT_MONTH_DAY' | 'THIS_MONTH_END' | 'NEXT_MONTH_END';
  paymentTermsValue?: number | null;
}

export function useUpdatePaymentTerms() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, UpdatePaymentTermsParams>({
    mutationFn: async ({ receivableId, paymentTermsType, paymentTermsValue }) => {
      const response = await api.patch(`/receivables/${receivableId}/payment-terms`, {
        paymentTermsType,
        paymentTermsValue,
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receivable', variables.receivableId] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
    },
  });
}

export function useUpdateReceivableNotes() {
  const queryClient = useQueryClient();
  return useMutation<ReceivableDetail, Error, { receivableId: string; notes: string | null }>({
    mutationFn: async ({ receivableId, notes }) => {
      const response = await api.patch<ReceivableDetail>(`/receivables/${receivableId}/notes`, {
        notes,
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['receivable', variables.receivableId], data);
      queryClient.invalidateQueries({ queryKey: ['receivable', variables.receivableId] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
    },
  });
}

export function useUpdateSmsExcluded() {
  const queryClient = useQueryClient();
  return useMutation<
    { success: boolean; smsExcluded: boolean },
    Error,
    { customerId: string; smsExcluded: boolean }
  >({
    mutationFn: async ({ customerId, smsExcluded }) => {
      console.log('[useUpdateSmsExcluded] API 호출 시작:', {
        customerId,
        smsExcluded,
        timestamp: new Date().toISOString(),
      });
      
      const response = await api.patch<{ success: boolean; smsExcluded: boolean }>(
        `/receivables/customers/${customerId}/sms-excluded`,
        { smsExcluded },
      );
      
      console.log('[useUpdateSmsExcluded] API 호출 성공:', {
        customerId,
        response: response.data,
        timestamp: new Date().toISOString(),
      });
      
      return response.data;
    },
    onSuccess: (data, variables) => {
      console.log('[useUpdateSmsExcluded] onSuccess:', {
        data,
        variables,
        timestamp: new Date().toISOString(),
      });
      
      console.log('[useUpdateSmsExcluded] 쿼리 무효화 시작');
      queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
      console.log('[useUpdateSmsExcluded] 쿼리 무효화 완료');
    },
    onError: (error, variables) => {
      console.error('[useUpdateSmsExcluded] onError:', {
        error,
        variables,
        timestamp: new Date().toISOString(),
      });
    },
  });
}

export function useBatchUpdateSmsExcluded(params?: GetCustomersWithReceivablesParams) {
  const queryClient = useQueryClient();
  return useMutation<
    { success: boolean; updatedCount: number },
    Error,
    { customerIds: string[]; smsExcluded: boolean },
    { previousData?: GetCustomersWithReceivablesResponse }
  >({
    mutationFn: async ({ customerIds, smsExcluded }) => {
      const response = await api.patch<{ success: boolean; updatedCount: number }>(
        '/receivables/customers/sms-excluded/batch',
        { customerIds, smsExcluded },
      );
      return response.data;
    },
    onMutate: async ({ customerIds, smsExcluded }) => {
      console.log('[useBatchUpdateSmsExcluded] onMutate 시작:', {
        customerIds,
        smsExcluded,
        params,
        timestamp: new Date().toISOString(),
      });
      
      // 현재 쿼리 취소
      const queryKey = ['customers-with-receivables', params];
      console.log('[useBatchUpdateSmsExcluded] 쿼리 취소:', { queryKey });
      await queryClient.cancelQueries({ queryKey });
      
      // 이전 데이터 백업
      const previousData = queryClient.getQueryData<GetCustomersWithReceivablesResponse>(queryKey);
      console.log('[useBatchUpdateSmsExcluded] 이전 데이터:', {
        queryKey,
        previousData: previousData ? {
          total: previousData.total,
          dataLength: previousData.data.length,
          customers: previousData.data.map(c => ({
            id: c.customerId,
            name: c.companyName,
            smsExcluded: c.smsExcluded,
          })),
        } : null,
      });
      
      // Optimistic update: 현재 쿼리의 캐시를 즉시 업데이트
      if (previousData) {
        const updatedData = {
          ...previousData,
          data: previousData.data.map((customer) => {
            if (customerIds.includes(customer.customerId)) {
              return {
                ...customer,
                smsExcluded,
              };
            }
            return customer;
          }),
        };
        
        console.log('[useBatchUpdateSmsExcluded] Optimistic update 적용:', {
          queryKey,
          updatedData: {
            total: updatedData.total,
            dataLength: updatedData.data.length,
            updatedCustomers: updatedData.data
              .filter(c => customerIds.includes(c.customerId))
              .map(c => ({
                id: c.customerId,
                name: c.companyName,
                smsExcluded: c.smsExcluded,
              })),
          },
        });
        
        queryClient.setQueryData<GetCustomersWithReceivablesResponse>(queryKey, updatedData);
      }
      
      // 모든 관련 쿼리도 업데이트 (다른 파라미터로 조회한 경우 대비)
      console.log('[useBatchUpdateSmsExcluded] 모든 관련 쿼리 업데이트 시작');
      queryClient.setQueriesData<GetCustomersWithReceivablesResponse>(
        { queryKey: ['customers-with-receivables'] },
        (oldData) => {
          if (!oldData) return oldData;
          
          const updated = {
            ...oldData,
            data: oldData.data.map((customer) => {
              if (customerIds.includes(customer.customerId)) {
                return {
                  ...customer,
                  smsExcluded,
                };
              }
              return customer;
            }),
          };
          
          console.log('[useBatchUpdateSmsExcluded] 관련 쿼리 업데이트:', {
            oldDataLength: oldData.data.length,
            updatedDataLength: updated.data.length,
            updatedCustomers: updated.data
              .filter(c => customerIds.includes(c.customerId))
              .map(c => ({
                id: c.customerId,
                name: c.companyName,
                smsExcluded: c.smsExcluded,
              })),
          });
          
          return updated;
        },
      );
      
      console.log('[useBatchUpdateSmsExcluded] onMutate 완료');
      return { previousData };
    },
    onError: (err, variables, context) => {
      console.error('[useBatchUpdateSmsExcluded] onError:', {
        error: err,
        variables,
        context,
        timestamp: new Date().toISOString(),
      });
      
      // 에러 발생 시 롤백
      if (context?.previousData) {
        const queryKey = ['customers-with-receivables', params];
        console.log('[useBatchUpdateSmsExcluded] 롤백 시작:', { queryKey });
        queryClient.setQueryData(queryKey, context.previousData);
        console.log('[useBatchUpdateSmsExcluded] 롤백 완료');
      }
      queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
    },
    onSuccess: async (data, variables) => {
      console.log('[useBatchUpdateSmsExcluded] onSuccess 시작:', {
        data,
        variables,
        params,
        timestamp: new Date().toISOString(),
      });
      
      // Optimistic update가 이미 적용되었으므로, 서버 응답으로 최종 확인만 하면 됨
      // invalidateQueries를 호출하면 Optimistic update가 덮어써질 수 있으므로
      // 대신 모든 관련 쿼리의 데이터가 올바른지 확인하고 필요시 업데이트
      const queryKey = ['customers-with-receivables', params];
      const currentCache = queryClient.getQueryData<GetCustomersWithReceivablesResponse>(queryKey);
      
      console.log('[useBatchUpdateSmsExcluded] onSuccess - 현재 캐시 확인:', {
        queryKey,
        currentCache: currentCache ? {
          total: currentCache.total,
          dataLength: currentCache.data.length,
          updatedCustomers: currentCache.data
            .filter(c => variables.customerIds.includes(c.customerId))
            .map(c => ({
              id: c.customerId,
              name: c.companyName,
              smsExcluded: c.smsExcluded,
            })),
        } : null,
      });
      
      // Optimistic update가 이미 올바르게 적용되었으므로 invalidateQueries만 호출
      // (서버 데이터와 동기화를 위해)
      console.log('[useBatchUpdateSmsExcluded] 쿼리 무효화 시작 (서버 동기화)');
      queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
      console.log('[useBatchUpdateSmsExcluded] 쿼리 무효화 완료');
    },
  });
}

export interface SmsBatchHistoryItem {
  id: number;
  createdAt: string;
  createdBy: { id: number; name: string | null } | null;
  trigger: string;
  senderId: number;
  senderName: string | null;
  filterParams: Record<string, unknown> | null;
  totalTarget: number;
  sentCount: number;
  failCount: number;
  results: Array<{
    customerId: string;
    companyName: string | null;
    success: boolean;
    error?: string;
  }> | null;
}

export interface GetSmsBatchHistoryResponse {
  data: SmsBatchHistoryItem[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export function useSmsBatchHistory(params?: { page?: number; limit?: number }) {
  return useQuery<GetSmsBatchHistoryResponse>({
    queryKey: ['receivables', 'sms-batch-history', params?.page ?? 1, params?.limit ?? 20],
    queryFn: async () => {
      const response = await api.get<GetSmsBatchHistoryResponse>('/receivables/sms-batch-history', {
        params: { page: params?.page ?? 1, limit: params?.limit ?? 20 },
      });
      return response.data;
    },
  });
}
