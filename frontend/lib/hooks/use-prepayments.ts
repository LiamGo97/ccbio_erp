import { useQuery, useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PrepaymentListItem {
  id: string;
  customerId: string;
  customerName: string | null;
  salesId: string;
  salesDate: string | null;
  reservationDate: string | null;
  prepaymentAmount: number;
  actualAmount: number | null;
  differenceAmount: number | null;
  status: string; // DEPRECATED: 하위 호환성 유지
  paymentStatus: string;
  deductionStatus: string;
  requestedDate: string | null;
  confirmedDate: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PrepaymentDetail {
  id: string;
  customerId: string;
  customerName: string | null;
  salesId: string;
  salesDate: string | null;
  reservationDate: string | null;
  prepaymentAmount: number;
  actualAmount: number | null;
  differenceAmount: number | null;
  status: string; // DEPRECATED: 하위 호환성 유지
  paymentStatus: string;
  deductionStatus: string;
  requestedDate: string | null;
  confirmedDate: string | null;
  deductedDate: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetPrepaymentsParams {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: string;
}

export interface GetPrepaymentsResponse {
  data: PrepaymentListItem[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export function usePrepayments(params?: GetPrepaymentsParams) {
  return useQuery<GetPrepaymentsResponse>({
    queryKey: ['prepayments', params],
    queryFn: async () => {
      const response = await api.get<GetPrepaymentsResponse>('/prepayments', { params });
      return response.data;
    },
  });
}

export function usePrepayment(id?: string) {
  return useQuery<PrepaymentDetail>({
    queryKey: ['prepayment', id],
    queryFn: async () => {
      if (!id) throw new Error('Prepayment ID is required');
      const response = await api.get<PrepaymentDetail>(`/prepayments/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export interface ConfirmPrepaymentParams {
  prepaymentId: string;
  actualAmount: number;
  confirmedDate?: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
}

export function useConfirmPrepayment() {
  const queryClient = useQueryClient();
  return useMutation<PrepaymentDetail, Error, ConfirmPrepaymentParams>({
    mutationFn: async ({ prepaymentId, ...dto }) => {
      const response = await api.put<PrepaymentDetail>(`/prepayments/${prepaymentId}/confirm`, dto);
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prepayment', variables.prepaymentId] });
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
    },
  });
}

export function useCancelPrepayment() {
  const queryClient = useQueryClient();
  return useMutation<PrepaymentDetail, Error, string>({
    mutationFn: async (prepaymentId) => {
      const response = await api.post<PrepaymentDetail>(`/prepayments/${prepaymentId}/cancel`);
      return response.data;
    },
    onSuccess: (data, prepaymentId) => {
      queryClient.invalidateQueries({ queryKey: ['prepayment', prepaymentId] });
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
    },
  });
}

export interface UpdatePrepaymentParams {
  prepaymentId: string;
  actualAmount: number;
  confirmedDate?: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
}

export function useUpdatePrepayment() {
  const queryClient = useQueryClient();
  return useMutation<PrepaymentDetail, Error, UpdatePrepaymentParams>({
    mutationFn: async ({ prepaymentId, ...dto }) => {
      const response = await api.put<PrepaymentDetail>(`/prepayments/${prepaymentId}`, dto);
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['prepayment', variables.prepaymentId] });
      queryClient.invalidateQueries({ queryKey: ['prepayments'] });
    },
  });
}
