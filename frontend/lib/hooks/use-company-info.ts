import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

export interface CompanyInfo {
  id: number;
  businessRegistrationNumber: string;
  representativeName: string;
  companyName: string;
  address: string;
  tel: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCompanyInfoDto {
  businessRegistrationNumber: string;
  representativeName: string;
  companyName: string;
  address: string;
  tel: string;
}

export function useCompanyInfo() {
  return useQuery<CompanyInfo | null>({
    queryKey: ['company-info'],
    queryFn: async () => {
      const response = await api.get<CompanyInfo | null>('/company-info');
      return response.data;
    },
  });
}

export function useUpdateCompanyInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: UpdateCompanyInfoDto) => {
      const response = await api.put<CompanyInfo>('/company-info', dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-info'] });
      toast({
        title: '저장 완료',
        description: '회사 정보가 저장되었습니다.',
      });
    },
    onError: (error: any) => {
      toast({
        title: '저장 실패',
        description: error.response?.data?.message || '회사 정보 저장에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

