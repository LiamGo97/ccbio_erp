import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface VehicleDispatch {
  id: number;
  requestVehicle?: string | null;
  requestWeight?: string | null;
  loadingWarehouseId?: number | null;
  loadingWarehouse?: {
    id: number;
    name: string;
    postalCode?: string | null;
    address?: string | null;
    addressDetail?: string | null;
    useInternalGyegeundae?: boolean;
    gyegeundaePostalCode?: string | null;
    gyegeundaeAddress?: string | null;
    gyegeundaeAddressDetail?: string | null;
    managerName?: string | null;
    managerPhone?: string | null;
  } | null;
  loadingItems?: {
    id: number;
    loadingWarehouseId?: number | null;
    loadingWarehouse?: {
      id: number;
      name: string;
      postalCode?: string | null;
      address?: string | null;
      addressDetail?: string | null;
      useInternalGyegeundae?: boolean;
      gyegeundaePostalCode?: string | null;
      gyegeundaeAddress?: string | null;
      gyegeundaeAddressDetail?: string | null;
      managerName?: string | null;
      managerPhone?: string | null;
    } | null;
    requestBL?: string | null;
    requestContainer?: string | null;
    workBL?: string | null;
    workContainer?: string | null;
    workWeight?: string | null;
    status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';
    order?: number;
    notes?: string | null;
  }[];
  loadingSchedule?: string | null;
  loadingScheduleTime?: string | null;
  unloadingPostalCode?: string | null;
  unloadingAddress?: string | null;
  unloadingAddressDetail?: string | null;
  unloadingRegionId?: number | null;
  unloadingCityId?: number | null;
  unloadingRegion?: {
    id: number;
    name: string;
  } | null;
  unloadingCity?: {
    id: number;
    name: string;
    regionId: number;
  } | null;
  unloadingSchedule?: string | null;
  unloadingScheduleDate?: string | null;
  unloadingScheduleTime?: string | null;
  freightPaymentType?: string | null;
  companyName?: string | null;
  representativeName?: string | null;
  phone?: string | null;
  requestBL?: string | null;
  requestContainer?: string | null;
  orderNumber?: string | null;
  workBL?: string | null;
  workContainer?: string | null;
  notes?: string | null;
  status?: 'DRAFT' | 'DISPATCHING' | 'DISPATCH_COMPLETED' | 'ASSIGNED' | 'LOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED' | 'UNLOADING_COMPLETED';
  createdBy?: number | null;
  createdByUser?: {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  assignedTo?: number | null;
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
  directUnloadingContact?: string | null;
  completedAt?: string | null;
  vehicleNumber?: string | null;
  driverContact?: string | null;
  driverName?: string | null;
  entryTime?: string | null;
  transportFee?: number | null;
  weighingFee?: number | null;
  loadingDateTime?: string | null;
  unloadingDateTime?: string | null;
  statusReason?: string | null;
  hasFailed?: boolean;
  hasRescheduled?: boolean;
  reprocessReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleDispatchDto {
  requestVehicle?: string;
  requestWeight?: string;
  loadingWarehouseId?: number;
  loadingSchedule?: string;
  loadingScheduleTime?: string;
  unloadingPostalCode?: string;
  unloadingAddress?: string;
  unloadingAddressDetail?: string;
  unloadingRegion?: string;
  unloadingCity?: string;
  unloadingSchedule?: string;
  unloadingScheduleDate?: string;
  unloadingScheduleTime?: string;
  freightPaymentType?: string;
  companyName?: string;
  representativeName?: string;
  phone?: string;
  requestBL?: string;
  requestContainer?: string;
  orderNumber?: string;
  workBL?: string;
  workContainer?: string;
  workWeight?: string;
  notes?: string;
  dispatchCompanyId?: number | null;
  unloadingCompanyId?: number | null;
  directUnloadingContact?: string;
  vehicleNumber?: string;
  driverContact?: string;
  driverName?: string;
  entryTime?: string;
  transportFee?: number;
  weighingFee?: number;
  customerPostalCode?: string;
  customerAddress?: string;
  customerAddressDetail?: string;
  customerRegion?: string;
  customerCity?: string;
  loadingItems?: {
    loadingWarehouseId?: number;
    requestBL?: string;
    requestContainer?: string;
    workBL?: string;
    workContainer?: string;
    workWeight?: string;
    status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';
    order?: number;
    notes?: string;
  }[];
}

export interface UpdateVehicleDispatchDto {
  requestVehicle?: string;
  requestWeight?: string;
  loadingWarehouseId?: number;
  loadingSchedule?: string;
  loadingScheduleTime?: string;
  unloadingPostalCode?: string;
  unloadingAddress?: string;
  unloadingAddressDetail?: string;
  unloadingRegion?: string;
  unloadingCity?: string;
  unloadingSchedule?: string;
  unloadingScheduleDate?: string;
  unloadingScheduleTime?: string;
  freightPaymentType?: string;
  companyName?: string;
  representativeName?: string;
  phone?: string;
  requestBL?: string;
  requestContainer?: string;
  orderNumber?: string;
  workBL?: string;
  workContainer?: string;
  workWeight?: string;
  notes?: string;
  status?: 'DRAFT' | 'DISPATCHING' | 'DISPATCH_COMPLETED' | 'ASSIGNED' | 'LOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED' | 'UNLOADING_COMPLETED';
  dispatchCompanyId?: number | null;
  unloadingCompanyId?: number | null;
  directUnloadingContact?: string;
  vehicleNumber?: string;
  driverContact?: string;
  driverName?: string;
  entryTime?: string;
  transportFee?: number;
  weighingFee?: number;
  loadingDateTime?: string;
  unloadingDateTime?: string;
  statusReason?: string;
  hasFailed?: boolean;
  hasRescheduled?: boolean;
  reprocessReason?: string;
  customerPostalCode?: string;
  customerAddress?: string;
  customerAddressDetail?: string;
  customerRegion?: string;
  customerCity?: string;
  loadingItems?: {
    loadingWarehouseId?: number;
    requestBL?: string;
    requestContainer?: string;
    workBL?: string;
    workContainer?: string;
    workWeight?: string;
    status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';
    order?: number;
    notes?: string;
  }[];
}

export interface GetVehicleDispatchesParams {
  dispatchCompanyId?: number;
  loadingWarehouseId?: number;
}

export function useVehicleDispatches(params?: GetVehicleDispatchesParams, options?: { refetchInterval?: number }) {
  return useQuery<VehicleDispatch[]>({
    queryKey: ['vehicle-dispatch', params],
    queryFn: async () => {
      const apiParams: Record<string, number> = {};
      if (params?.dispatchCompanyId) {
        apiParams.dispatchCompanyId = params.dispatchCompanyId;
      }
      if (params?.loadingWarehouseId) {
        apiParams.loadingWarehouseId = params.loadingWarehouseId;
      }
      const response = await api.get<VehicleDispatch[]>('/vehicle-dispatch', {
        params: Object.keys(apiParams).length > 0 ? apiParams : undefined,
      });
      return response.data;
    },
    enabled: params?.dispatchCompanyId !== undefined || params?.loadingWarehouseId !== undefined || params === undefined,
    refetchInterval: options?.refetchInterval, // 자동 갱신 간격 (밀리초)
    refetchIntervalInBackground: false, // 백그라운드에서는 중지 (비용 절감)
    refetchOnWindowFocus: true, // 탭 활성화 시 즉시 갱신
  });
}

export function useVehicleDispatch(id: number | undefined) {
  return useQuery<VehicleDispatch>({
    queryKey: ['vehicle-dispatch', id],
    queryFn: async () => {
      if (!id) {
        throw new Error('Vehicle dispatch ID is required');
      }
      const response = await api.get<VehicleDispatch>(`/vehicle-dispatch/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateVehicleDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateVehicleDispatchDto) => {
      const response = await api.post<VehicleDispatch>('/vehicle-dispatch', data);
      return response.data;
    },
    onSuccess: async () => {
      // 모든 vehicle-dispatch 쿼리를 무효화하고 즉시 refetch
      await queryClient.invalidateQueries({ queryKey: ['vehicle-dispatch'] });
      // 무효화 후 즉시 refetch를 보장하기 위해 refetch
      await queryClient.refetchQueries({ 
        queryKey: ['vehicle-dispatch'],
        predicate: (query) => {
          const queryKey = query.queryKey;
          if (queryKey[0] !== 'vehicle-dispatch') return false;
          // 목록 쿼리 (queryKey 길이가 1 또는 2이고 두 번째가 객체인 경우)
          if (queryKey.length === 1) return true;
          if (queryKey.length === 2 && typeof queryKey[1] === 'object') return true;
          // 상세 쿼리 (queryKey 길이가 2이고 두 번째가 숫자인 경우만, undefined 제외)
          if (queryKey.length === 2 && typeof queryKey[1] === 'number' && queryKey[1] !== undefined) return true;
          return false;
        }
      });
    },
  });
}

export function useUpdateVehicleDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateVehicleDispatchDto }) => {
      const response = await api.put<VehicleDispatch>(`/vehicle-dispatch/${id}`, data);
      return response.data;
    },
    onSuccess: async () => {
      // 모든 vehicle-dispatch 쿼리를 무효화하고 즉시 refetch
      await queryClient.invalidateQueries({ queryKey: ['vehicle-dispatch'] });
      // 무효화 후 즉시 refetch를 보장하기 위해 refetch (ID가 undefined가 아닌 쿼리만)
      await queryClient.refetchQueries({ 
        queryKey: ['vehicle-dispatch'],
        predicate: (query) => {
          const queryKey = query.queryKey;
          if (queryKey[0] !== 'vehicle-dispatch') return false;
          // 목록 쿼리 (queryKey 길이가 1 또는 2이고 두 번째가 객체인 경우)
          if (queryKey.length === 1) return true;
          if (queryKey.length === 2 && typeof queryKey[1] === 'object') return true;
          // 상세 쿼리 (queryKey 길이가 2이고 두 번째가 숫자인 경우만, undefined 제외)
          if (queryKey.length === 2 && typeof queryKey[1] === 'number' && queryKey[1] !== undefined) return true;
          return false;
        }
      });
    },
  });
}

export function useDeleteVehicleDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/vehicle-dispatch/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-dispatch'] });
    },
  });
}

export interface StatusChangeHistory {
  id: number;
  entityType: string;
  entityId: number;
  changeType: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'DELETE';
  changedFields?: Record<string, { old: any; new: any }> | null;
  oldData?: Record<string, any> | null;
  newData?: Record<string, any> | null;
  changedBy?: number | null;
  changedByUser?: {
    id: number;
    name: string;
    email: string;
  } | null;
  changedAt: string;
  description?: string | null;
}

export function useVehicleDispatchStatusChanges(limit: number = 10) {
  return useQuery<StatusChangeHistory[]>({
    queryKey: ['vehicle-dispatch', 'status-changes', limit],
    queryFn: async () => {
      const response = await api.get<StatusChangeHistory[]>(
        '/vehicle-dispatch/history/status-changes',
        { params: { limit } }
      );
      return response.data;
    },
    refetchInterval: 30000, // 30초마다 자동 갱신
  });
}

export function useVehicleDispatchAllChanges(limit: number = 10, options?: { refetchInterval?: number }) {
  return useQuery<StatusChangeHistory[]>({
    queryKey: ['vehicle-dispatch', 'all-changes', limit],
    queryFn: async () => {
      const response = await api.get<StatusChangeHistory[]>(
        '/vehicle-dispatch/history/all',
        { params: { limit } }
      );
      return response.data;
    },
    refetchInterval: options?.refetchInterval ?? 30000, // 기본 30초마다 자동 갱신
    refetchIntervalInBackground: false, // 백그라운드에서는 중지
  });
}

