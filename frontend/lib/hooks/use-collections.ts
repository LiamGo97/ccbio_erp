import { useQuery, useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CollectionListItem {
  id: string;
  collectionNumber: string | null;
  receivableId: string;
  customerId: string;
  customerName: string | null;
  companyName: string | null;
  ceo: string | null;
  collectionAmount: number;
  collectionDate: string;
  collectionMethod: string | null;
  notes: string | null;
  isPrepayment: boolean;
  createdAt: string;
}

export type CollectionListSortField =
  | 'collectionDate'
  | 'collectionNumber'
  | 'companyName'
  | 'ceo'
  | 'collectionAmount'
  | 'collectionMethod'
  | 'isPrepayment'
  | 'notes'
  | 'createdAt';

export type CollectionPrepaymentFilter = 'all' | 'prepayment' | 'normal';

export interface GetCollectionsParams {
  page?: number;
  limit?: number;
  customerId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  /** 미전달 또는 all = 필터 없음 */
  prepaymentFilter?: CollectionPrepaymentFilter;
  sortBy?: CollectionListSortField;
  sortOrder?: 'asc' | 'desc';
}

export interface GetCollectionsResponse {
  data: CollectionListItem[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
  /** 필터 조건 전체에 대한 수금액 합계 */
  totalCollectionAmount: number;
}

export function useCollections(params?: GetCollectionsParams) {
  return useQuery<GetCollectionsResponse>({
    queryKey: ['collections', params],
    queryFn: async () => {
      const response = await api.get<GetCollectionsResponse>('/receivables/collections', { params });
      return response.data;
    },
  });
}

export interface CollectByCustomerParams {
  customerId: string;
  collectionAmount: number;
  collectionDate: string;
  collectionMethod?: string | null;
  /** 0=공급자 없음, number=공급자 ID, 미전달=변경 안 함 */
  supplierId?: number | null;
  notes?: string | null;
  isPrepayment?: boolean;
}

export function useCollectByCustomer() {
  const queryClient = useQueryClient();
  return useMutation<CollectionListItem, Error, CollectByCustomerParams>({
    mutationFn: async ({ customerId, ...dto }) => {
      const response = await api.post<CollectionListItem>(
        `/receivables/customers/${customerId}/collect`,
        dto,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
    },
  });
}

export interface UpdateCollectionParams {
  receivableId: string;
  collectionId: string;
  collectionAmount: number;
  collectionDate: string;
  collectionMethod?: string | null;
  /** 0=공급자 없음, number=공급자 ID, 미전달=변경 안 함 */
  supplierId?: number | null;
  notes?: string | null;
  isPrepayment?: boolean;
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation<CollectionListItem, Error, UpdateCollectionParams>({
    mutationFn: async ({ receivableId, collectionId, ...dto }) => {
      const response = await api.put<CollectionListItem>(
        `/receivables/${receivableId}/collections/${collectionId}`,
        dto,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivable', variables.receivableId] });
      queryClient.invalidateQueries({ queryKey: ['receivable-collections', variables.receivableId] });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { receivableId: string; collectionId: string }>({
    mutationFn: async ({ receivableId, collectionId }) => {
      await api.delete(`/receivables/${receivableId}/collections/${collectionId}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['receivable', variables.receivableId] });
      queryClient.invalidateQueries({ queryKey: ['receivable-collections', variables.receivableId] });
    },
  });
}
