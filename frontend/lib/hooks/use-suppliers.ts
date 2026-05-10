import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

export interface Supplier {
  id: number;
  businessRegistrationNumber: string;
  representativeName: string;
  companyName: string;
  address: string;
  tel: string;
  status: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GetSuppliersParams {
  search?: string;
  status?: boolean;
}

export interface CreateSupplierDto {
  businessRegistrationNumber: string;
  representativeName: string;
  companyName: string;
  address: string;
  tel: string;
  status?: boolean;
}

export interface UpdateSupplierDto {
  businessRegistrationNumber?: string;
  representativeName?: string;
  companyName?: string;
  address?: string;
  tel?: string;
  status?: boolean;
}

// 공급자 목록 조회
export function useSuppliers(params?: GetSuppliersParams) {
  return useQuery<Supplier[]>({
    queryKey: ['suppliers', params],
    queryFn: async () => {
      const response = await api.get<Supplier[]>('/suppliers', { params });
      return response.data;
    },
  });
}

// 공급자 단일 조회
export function useSupplier(id: number | undefined) {
  return useQuery<Supplier>({
    queryKey: ['suppliers', id],
    queryFn: async () => {
      const response = await api.get<Supplier>(`/suppliers/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

// 공급자 생성
export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSupplierDto) => {
      const response = await api.post<Supplier>('/suppliers', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({
        title: '생성 완료',
        description: '공급자가 생성되었습니다.',
      });
    },
    onError: (error: any) => {
      toast({
        title: '생성 실패',
        description: error.response?.data?.message || '공급자 생성에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

// 공급자 수정
export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateSupplierDto }) => {
      const response = await api.patch<Supplier>(`/suppliers/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({
        title: '수정 완료',
        description: '공급자 정보가 수정되었습니다.',
      });
    },
    onError: (error: any) => {
      toast({
        title: '수정 실패',
        description: error.response?.data?.message || '공급자 수정에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

// 공급자 삭제
export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/suppliers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({
        title: '삭제 완료',
        description: '공급자가 삭제되었습니다.',
      });
    },
    onError: (error: any) => {
      toast({
        title: '삭제 실패',
        description: error.response?.data?.message || '공급자 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}
