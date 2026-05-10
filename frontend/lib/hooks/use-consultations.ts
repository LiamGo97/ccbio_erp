import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { CustomerOperation } from './customer-operation.dto';
import { toast } from '@/components/ui/use-toast';

export interface ConsultationProduct {
  id: number;
  productCategoryId: number | null;
  productName: string | null;
  grade: string | null;
  packingType: string | null;
   requestedWeight: string | null;
   requestedVehicle: string | null;
  order: number;
}

export interface ConsultationProductPayload {
  productCategoryId?: number | null;
  productName?: string | null;
  grade?: string | null;
  packingType?: string | null;
  requestedWeight?: string | null;
  requestedVehicle?: string | null;
  order?: number;
}

export interface Consultation {
  id: string;
  customerId: string | null;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
  region: string | null;
  customerPostalCode: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  addressDetail: string | null;
  species: string | null;
  operation: string | null;
  herdSize: string | null;
  feeding: string | null;
  chamchamStatus: string | null;
  operations?: CustomerOperation[]; // 운영방식 배열
  inquiryProduct: string | null;
  consultationDate: string | null;
  startedAt: string | null;
  endedAt: string | null;
  type: string | null;
  source: string | null;
  inOut: string | null;
  productName: string | null; // 호환성을 위해 유지
  grade: string | null; // 호환성을 위해 유지
  products?: ConsultationProduct[]; // 새로운 제품 정보 배열
  requestedWeight: string | null;
  deliveryRegion: string | null;
  deliveryPostalCode: string | null;
  deliveryAddress: string | null;
  deliveryAddressDetail: string | null;
  deliveryCity: string | null;
  proposedPrice: string | null;
  hasUnloading: boolean;
  hasHandling: boolean;
  notes: string | null;
  managerId: number | null;
  managerName: string | null;
  mainProduct: string | null;
  arrivalPrice: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultationListResponse {
  data: Consultation[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetConsultationsParams {
  search?: string;
  phone?: string;
  inOut?: string;
  type?: string;
  source?: string;
  managerId?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'consultationDate' | 'companyName' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateConsultationPayload {
  phone: string;
  companyName?: string;
  ceo?: string;
  region?: string;
  customerPostalCode?: string;
  customerAddress?: string;
  customerCity?: string;
  addressDetail?: string;
  species?: string;
  operation?: string;
  herdSize?: string;
  feeding?: string;
  chamchamStatus?: string;
  operations?: CustomerOperation[]; // 운영방식 배열
  inquiryProduct?: string;
  consultationDate?: string;
  startedAt?: string;
  endedAt?: string;
  type?: string;
  source?: string;
  inOut?: string;
  productName?: string; // 호환성을 위해 유지
  grade?: string; // 호환성을 위해 유지
  products?: ConsultationProductPayload[]; // 새로운 제품 정보 배열
  requestedWeight?: string;
  deliveryRegion?: string;
  deliveryPostalCode?: string;
  deliveryAddress?: string;
  deliveryAddressDetail?: string;
  deliveryCity?: string;
  proposedPrice?: string;
  hasUnloading?: boolean;
  hasHandling?: boolean;
  notes?: string;
  managerId?: number | string | null;
  mainProduct?: string; // 주 사용제품
  arrivalPrice?: string; // 도착가
}

export type UpdateConsultationPayload = Partial<CreateConsultationPayload>;

export function useConsultations(params: GetConsultationsParams) {
  return useQuery<ConsultationListResponse>({
    queryKey: ['consultations', params],
    queryFn: async () => {
      const response = await api.get<ConsultationListResponse>('/consultations', { params });
      return response.data;
    },
  });
}

export function useConsultation(id?: string) {
  return useQuery<Consultation>({
    queryKey: ['consultation', id],
    queryFn: async () => {
      const response = await api.get<Consultation>(`/consultations/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateConsultationPayload) => {
      const response = await api.post<Consultation>('/consultations', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      toast({
        title: '상담이 추가되었습니다',
        description: '새로운 상담 정보가 성공적으로 저장되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      toast({
        title: '상담 추가 실패',
        description: message || '상담 추가 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateConsultationPayload }) => {
      const response = await api.patch<Consultation>(`/consultations/${id}`, data);
      return response.data;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      queryClient.invalidateQueries({ queryKey: ['consultation', variables.id] });
      toast({
        title: '상담이 수정되었습니다',
        description: '상담 정보가 성공적으로 업데이트되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      toast({
        title: '상담 수정 실패',
        description: message || '상담 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/consultations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      toast({
        title: '상담이 삭제되었습니다',
        description: '상담 정보가 성공적으로 삭제되었습니다.',
      });
    },
    onError: (error: unknown) => {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      toast({
        title: '상담 삭제 실패',
        description: message || '상담 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export interface ConsultationLookupResult {
  customer: {
    id: string;
    phone: string | null;
    companyName: string | null;
    ceo: string | null;
    region: string | null;
    customerPostalCode: string | null;
    customerAddress: string | null;
    customerCity: string | null;
    addressDetail: string | null;
    species: string | null;
    operation: string | null;
    herdSize: string | null;
    feeding: string | null;
    chamchamStatus: string | null;
    inquiryProduct: string | null;
    operations?: CustomerOperation[];
  } | null;
  consultations: Consultation[];
}

export function useConsultationLookup() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const response = await api.get<ConsultationLookupResult>('/consultations/lookup', {
        params: { phone },
      });
      return response.data;
    },
  });
}

