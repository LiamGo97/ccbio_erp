import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { CustomerOperation } from './customer-operation.dto';

export interface CustomerStatementName {
  id: string;
  customerId: string;
  companyName?: string | null;
  displayName: string;
  contactPhone?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDeliveryAddress {
  id: string;
  customerId: string;
  label?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  postalCode?: string | null;
  addressRoad?: string | null;
  addressJibun?: string | null;
  addressDefaultType: string;
  addressDetail?: string | null;
  legalBCode?: string | null;
  isDefault: boolean;
  isActive: boolean;
  mallDeliveryAddressId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  /** tb_region.re_id — 목록 매칭 실패 시에도 시·군·구 로드에 사용 */
  regionId?: number | null;
  /** tb_city.ci_id */
  cityId?: number | null;
  region: string;
  postalCode?: string | null;
  address?: string | null;
  addressDetail: string;
  city?: string | null;
  companyName: string;
  ceo: string;
  phone: string;
  customerType?: string | null; // FARM(농가) | DISTRIBUTION(유통)
  /** 이커머스 회원구분: API는 tb_code 한글명으로 내려올 수 있음 */
  memberType?: string | null;
  businessRegistrationNumber?: string | null;
  businessCertGoogleDriveFileId?: string | null;
  businessCertFileName?: string | null;
  residentRegistrationNumber?: string | null;
  farmManagementCertGoogleDriveFileId?: string | null;
  farmManagementCertFileName?: string | null;
  refundBankName?: string | null;
  refundAccountNumber?: string | null;
  refundDepositor?: string | null;
  salesManagerUserId?: number | null;
  salesManagerName?: string | null;
  /** 로그인(이메일) — `salesManagerName`과 함께 표시 */
  salesManagerEmail?: string | null;
  mallUserId?: string | null;
  species?: string | null;
  operation?: string | null;
  herdSize?: string | null;
  feeding?: string | null;
  livestockTypes?: string | null;
  operationMethod?: string | null;
  feedingMethod?: string | null;
  livestockCount?: number | null;
  chamchamStatus: string;
  /** 신규몰(Chamcharm) 참참회원 여부 — API는 tb_code 한글명으로 내려올 수 있음 */
  chamcharmMemberStatus?: string | null;
  /** 이벤트 SMS 응답(참여) 여부 */
  eventSmsResponded?: boolean;
  /** 비고(담당자·내부 메모) */
  remarks?: string | null;
  /** 상담 내역 건수 (목록 조회 응답) */
  consultationCount?: number;
  operations?: CustomerOperation[]; // 운영방식 배열
  statementNames?: CustomerStatementName[]; // 거래명세서 발행용 이름 목록
  deliveryAddresses?: CustomerDeliveryAddress[];
  /** 카카오 법정동코드(b_code) 저장값 */
  legalBCode?: string | null;
  /** 법정동 마스터 기준 시·도명 */
  legalSidoName?: string | null;
  /** 법정동 마스터 기준 시·군·구명 */
  legalSigunguName?: string | null;
  /** 법정동 마스터 기준 읍·면·동명 */
  legalEupmyeondongName?: string | null;
  /** 법정동 마스터 기준 리명 */
  legalRiName?: string | null;
  /** 도로명주소 */
  addressRoad?: string | null;
  /** 지번주소 */
  addressJibun?: string | null;
  /** 기본주소 구분 (쇼핑몰과 동일: ROAD=도로명, JIBUN=지번 등) */
  addressDefaultType?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetCustomersParams {
  search?: string;
  region?: string;
  chamchamStatus?: string;
  customerType?: string;
  species?: string;
  operation?: string;
  operationSub?: string;
  /** true: 응답함만, false: 미응답만, 생략: 전체 */
  eventSmsResponded?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetCustomersResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CustomerStats {
  total: number;
  byChamchamStatus: Array<{ status: string; count: number }>;
  byRegion: Array<{ region: string; count: number }>;
  bySpecies: Array<{ species: string; count: number }>;
  byRegionAndSpecies: Array<{ region: string; species: string; count: number }>;
  byRegionAndBeefSubtype?: Array<{ region: string; operationSub: string; count: number }>;
  byRegionAndDairySubtype?: Array<{ region: string; operationSub: string; count: number }>;
  byOperationDetails: Array<{ operation: string | null; operationSub: string | null; count: number }>;
}

export interface CreateCustomerDto {
  region: string;
  postalCode?: string;
  address?: string;
  addressRoad?: string;
  addressJibun?: string;
  addressDefaultType?: string;
  legalBCode?: string;
  addressDetail: string;
  city?: string;
  companyName: string;
  ceo: string;
  phone: string;
  customerType?: string;
  memberType?: string | null;
  businessRegistrationNumber?: string;
  businessCertGoogleDriveFileId?: string | null;
  businessCertFileName?: string | null;
  residentRegistrationNumber?: string;
  farmManagementCertGoogleDriveFileId?: string;
  farmManagementCertFileName?: string;
  refundBankName?: string;
  refundAccountNumber?: string;
  refundDepositor?: string;
  salesManagerUserId?: number | null;
  mallUserId?: string;
  species?: string;
  operation?: string;
  herdSize?: string;
  feeding?: string;
  livestockTypes?: string;
  operationMethod?: string;
  feedingMethod?: string;
  livestockCount?: number;
  chamchamStatus: string;
  chamcharmMemberStatus?: string;
  eventSmsResponded?: boolean;
  remarks?: string;
  operations?: CustomerOperation[]; // 운영방식 배열
}

export interface UpdateCustomerDto {
  region?: string;
  postalCode?: string;
  address?: string;
  addressRoad?: string;
  addressJibun?: string;
  addressDefaultType?: string;
  legalBCode?: string;
  addressDetail?: string;
  city?: string;
  companyName?: string;
  ceo?: string;
  phone?: string;
  customerType?: string;
  memberType?: string | null;
  businessRegistrationNumber?: string | null;
  businessCertGoogleDriveFileId?: string | null;
  businessCertFileName?: string | null;
  residentRegistrationNumber?: string | null;
  farmManagementCertGoogleDriveFileId?: string | null;
  farmManagementCertFileName?: string | null;
  refundBankName?: string | null;
  refundAccountNumber?: string | null;
  refundDepositor?: string | null;
  salesManagerUserId?: number | null;
  mallUserId?: string | null;
  species?: string;
  operation?: string;
  herdSize?: string;
  feeding?: string;
  livestockTypes?: string | null;
  operationMethod?: string | null;
  feedingMethod?: string | null;
  livestockCount?: number | null;
  chamchamStatus?: string;
  chamcharmMemberStatus?: string | null;
  eventSmsResponded?: boolean;
  remarks?: string | null;
  operations?: CustomerOperation[]; // 운영방식 배열
}

// 고객 목록 조회 (페이지네이션)
export function useCustomers(params?: GetCustomersParams) {
  return useQuery<GetCustomersResponse>({
    queryKey: ['customers', params],
    queryFn: async () => {
      try {
      const response = await api.get<GetCustomersResponse>('/customers', { params });
      return response.data;
      } catch (error) {
        console.error('useCustomers error:', error);
        throw error;
      }
    },
  });
}

export function useCustomerStats() {
  return useQuery<CustomerStats>({
    queryKey: ['customers', 'stats'],
    queryFn: async () => {
      try {
        const response = await api.get<CustomerStats>('/customers/stats');
        return response.data;
      } catch (error) {
        console.error('useCustomerStats error:', error);
        throw error;
      }
    },
  });
}

// 고객 단일 조회
export function useCustomer(id: string | undefined) {
  return useQuery<Customer>({
    queryKey: ['customers', id],
    queryFn: async () => {
      const response = await api.get<Customer>(`/customers/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

/** 고객 활성 배송지 목록 (판매 등록 등에서 선택용) */
export function useCustomerDeliveryAddresses(customerId: string | undefined) {
  return useQuery<CustomerDeliveryAddress[]>({
    queryKey: ['customers', customerId, 'delivery-addresses'],
    queryFn: async () => {
      const response = await api.get<CustomerDeliveryAddress[]>(
        `/customers/${customerId}/delivery-addresses`,
      );
      return response.data;
    },
    enabled: !!customerId,
  });
}

// 고객 생성
export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCustomerDto) => {
      const response = await api.post<Customer>('/customers', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

// 고객 수정
export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateCustomerDto }) => {
      const response = await api.patch<Customer>(`/customers/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

// 고객 삭제
export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export interface CreateStatementNameDto {
  companyName?: string | null;
  displayName: string;
  contactPhone?: string | null;
  isDefault?: boolean;
}

export interface UpdateStatementNameDto {
  companyName?: string | null;
  displayName?: string;
  contactPhone?: string | null;
  isDefault?: boolean;
}

// 발행용 이름 추가
export function useAddStatementName(customerId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateStatementNameDto) => {
      const response = await api.post<CustomerStatementName>(
        `/customers/${customerId}/statement-names`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

// 발행용 이름 수정
export function useUpdateStatementName(customerId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      statementNameId,
      data,
    }: {
      statementNameId: string;
      data: UpdateStatementNameDto;
    }) => {
      const response = await api.patch<CustomerStatementName>(
        `/customers/${customerId}/statement-names/${statementNameId}`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

// 발행용 이름 삭제
export function useRemoveStatementName(customerId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (statementNameId: string) => {
      await api.delete(`/customers/${customerId}/statement-names/${statementNameId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export interface CreateCustomerDeliveryAddressDto {
  label?: string;
  recipientName?: string;
  recipientPhone?: string;
  postalCode?: string;
  addressRoad?: string;
  addressJibun?: string;
  addressDefaultType?: string;
  addressDetail?: string;
  legalBCode?: string;
  isDefault?: boolean;
  mallDeliveryAddressId?: string;
}

export type UpdateCustomerDeliveryAddressDto = Partial<CreateCustomerDeliveryAddressDto> & {
  isActive?: boolean;
};

function invalidateCustomerQueries(queryClient: ReturnType<typeof useQueryClient>, customerId?: string) {
  queryClient.invalidateQueries({ queryKey: ['customers'] });
  if (customerId) {
    queryClient.invalidateQueries({ queryKey: ['customers', customerId] });
  }
}

export function useAddCustomerDeliveryAddress(customerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCustomerDeliveryAddressDto) => {
      const res = await api.post<CustomerDeliveryAddress>(
        `/customers/${customerId}/delivery-addresses`,
        data,
      );
      return res.data;
    },
    onSuccess: () => invalidateCustomerQueries(queryClient, customerId),
  });
}

export function useUpdateCustomerDeliveryAddress(customerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      addressId,
      data,
    }: {
      addressId: string;
      data: UpdateCustomerDeliveryAddressDto;
    }) => {
      const res = await api.patch<CustomerDeliveryAddress>(
        `/customers/${customerId}/delivery-addresses/${addressId}`,
        data,
      );
      return res.data;
    },
    onSuccess: () => invalidateCustomerQueries(queryClient, customerId),
  });
}

export function useRemoveCustomerDeliveryAddress(customerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (addressId: string) => {
      await api.delete(`/customers/${customerId}/delivery-addresses/${addressId}`);
    },
    onSuccess: () => invalidateCustomerQueries(queryClient, customerId),
  });
}
