import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface SalesVehicleDispatch {
  id: number;
  salesId?: string | null;
  sales?: {
    id: string;
    customerId?: string | null;
    customer?: {
      id: string;
      companyName?: string | null;
      ceo?: string | null;
      phone?: string | null;
    } | null;
    reservationDate?: string | null;
    salesDate?: string | null;
    items?: Array<{
      id: string;
      containerId?: string | null;
      cargoBales?: number | null;
      cargoWeight?: number | null;
      status?: string | null;
    }>;
  } | null;
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

export interface CreateSalesVehicleDispatchDto {
  salesId: string;
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
  status?: string;
}

export interface UpdateSalesVehicleDispatchDto extends Partial<CreateSalesVehicleDispatchDto> {
  status?: 'DRAFT' | 'DISPATCH_COMPLETED' | 'ASSIGNED' | 'LOADING_COMPLETED' | 'FAILED' | 'RESCHEDULED' | 'UNLOADING_COMPLETED';
  statusReason?: string;
  reprocessReason?: string;
}

export function useSalesVehicleDispatches(
  salesId?: string,
  options?: {
    refetchInterval?: number;
    enabled?: boolean;
  },
) {
  return useQuery<SalesVehicleDispatch[]>({
    queryKey: ['sales-vehicle-dispatch', salesId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (salesId) {
        params.append('salesId', salesId);
      }
      const response = await api.get(`/sales/vehicle-dispatch?${params.toString()}`);
      return response.data;
    },
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled !== false,
  });
}

export function useSalesVehicleDispatch(
  id: number,
  options?: {
    includeDeleted?: boolean;
    enabled?: boolean;
  },
) {
  return useQuery<SalesVehicleDispatch>({
    queryKey: ['sales-vehicle-dispatch', id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.includeDeleted) {
        params.append('includeDeleted', 'true');
      }
      const response = await api.get(`/sales/vehicle-dispatch/${id}?${params.toString()}`);
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
  });
}

export function useCreateSalesVehicleDispatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateSalesVehicleDispatchDto) => {
      const response = await api.post('/sales/vehicle-dispatch', dto);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-vehicle-dispatch'] });
    },
  });
}

export function useUpdateSalesVehicleDispatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateSalesVehicleDispatchDto }) => {
      const response = await api.put(`/sales/vehicle-dispatch/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sales-vehicle-dispatch'] });
      queryClient.invalidateQueries({ queryKey: ['sales-vehicle-dispatch', variables.id] });
    },
  });
}

export function useDeleteSalesVehicleDispatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.delete(`/sales/vehicle-dispatch/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-vehicle-dispatch'] });
    },
  });
}








