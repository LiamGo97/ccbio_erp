'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Plus, Filter, MapPin, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { SalesFormDrawer } from '@/components/sales/sales-form-drawer';
import { SalesDetailDrawer } from '@/components/sales/sales-detail-drawer';
import { useCreateSales, useSales, CreateSalesDto, Sales, useUpdateSales, useConfirmSales, UpdateSalesDto, SalesDetail } from '@/lib/hooks/use-sales';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Cookies from 'js-cookie';
import { useColumnSettings } from '@/hooks/use-column-settings';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';

// 쿠키에서 페이지당 행수 읽기
const getInitialPageSize = () => {
  if (typeof window === 'undefined') return 20;
  const saved = Cookies.get('data-table-page-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && [10, 20, 30, 50, 100].includes(parsed)) {
      return parsed;
    }
  }
  return 20;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

/** ISO 문자열이 타임존 없이 오면 UTC로 간주 (백엔드가 Z 미포함 시 로컬로 잘못 해석되는 문제 방지) */
const parseAsUtcIfNeeded = (value: string): string => {
  const s = String(value).trim();
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (isIsoLike && !hasTimezone) {
    return s.replace(/\.\d{3}$/, '') + 'Z';
  }
  return s;
};

/** 등록일시/수정일시용 - 날짜+시간 표시 (물류관리 참조, 한국시간) */
const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(parseAsUtcIfNeeded(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** 수정일시가 현재시간 5분 이내인지 여부 (노란색 배경 강조용) */
const isUpdatedWithin5Minutes = (updatedAt?: string | null): boolean => {
  if (!updatedAt) return false;
  const updated = new Date(parseAsUtcIfNeeded(updatedAt));
  if (Number.isNaN(updated.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  return diffMs >= 0 && diffMs <= 5 * 60 * 1000; // 5분 = 5 * 60 * 1000 ms
};

/** ETA 등 월일만 표시 (예: 02.25) */
const formatDateMonthDay = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  });
};

type SalesUnloadingBackfillResult = {
  ok: boolean;
  eligibleCount: number;
  processed: number;
  successCount: number;
  failureCount: number;
  failures: Array<{
    salesId: string;
    legacyAddressPreview: string;
    reason: string;
    lastQueryTried?: string | null;
  }>;
};

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  // 소수점 이하 0 제거
  const formatted = value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return formatted;
};

function SalesPageContent() {
  const queryClient = useQueryClient();
  const columnSettings = useColumnSettings('sales');
  const searchParams = useSearchParams();
  const [user, setUser] = React.useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit' | 'confirm'>('create');
  const [drawerSalesId, setDrawerSalesId] = React.useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedSalesId, setSelectedSalesId] = React.useState<string | null>(null);
  const [copyInitialData, setCopyInitialData] = React.useState<Partial<any> | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [sortBy, setSortBy] = React.useState<string>('createdAt');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [selectedStatuses, setSelectedStatuses] = React.useState<Set<string>>(new Set());
  const hasInitializedStatusFilter = React.useRef(false);
  const [search, setSearch] = React.useState<string>('');
  const [selectedWarehouseIds, setSelectedWarehouseIds] = React.useState<Set<string>>(new Set());
  const hasInitializedWarehouseFilter = React.useRef(false);
  /** true면 sa_cancelled_at이 있는(전체 취소) 판매도 목록에 포함 — 상태 필터(sa_status)와 별개 */
  const [includeCancelledSales, setIncludeCancelledSales] = React.useState(false);
  /** 상품 정보 판매 단가 구분(SALES_PRICE_STAGE). 빈 문자열이면 전체 */
  const [selectedSalesPriceStage, setSelectedSalesPriceStage] = React.useState('');
  const [backfillConfirmOpen, setBackfillConfirmOpen] = React.useState(false);
  const [backfillPreviewLoading, setBackfillPreviewLoading] = React.useState(false);
  const [backfillEligibleCount, setBackfillEligibleCount] = React.useState<number | null>(null);
  const [backfillRunLoading, setBackfillRunLoading] = React.useState(false);
  const [backfillResultOpen, setBackfillResultOpen] = React.useState(false);
  const [backfillResult, setBackfillResult] = React.useState<SalesUnloadingBackfillResult | null>(null);
  const createSalesMutation = useCreateSales();
  const updateSalesMutation = useUpdateSales();
  const confirmSalesMutation = useConfirmSales();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // URL 쿼리 open=판매ID 로 들어오면 해당 판매 상세 드로어 자동 오픈 (입고 확정 등에서 연결된 판매 링크용)
  React.useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      setSelectedSalesId(openId);
      setDetailDrawerOpen(true);
    }
  }, [searchParams]);

  // 컬럼 ID → API 정렬 필드 매핑 (백엔드 지원: createdAt | reservationDate | salesDate | customerName | status)
  const sortByApiField = React.useCallback((columnId: string): 'createdAt' | 'reservationDate' | 'salesDate' | 'customerName' | 'status' => {
    const map: Record<string, 'createdAt' | 'reservationDate' | 'salesDate' | 'customerName' | 'status'> = {
      createdAt: 'createdAt',
      reservationOrSalesDate: 'reservationDate',
      reservationDate: 'reservationDate',
      salesDate: 'salesDate',
      customerName: 'customerName',
      status: 'status',
    };
    return map[columnId] ?? 'createdAt';
  }, []);

  const router = useRouter();

  const handleSortChange = React.useCallback((columnId: string, order: 'asc' | 'desc') => {
    setSortBy(columnId);
    setSortOrder(order);
    setPage(1);
  }, []);

  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: salesItemStatusCodes = [] } = useCodeMastersByGroup('SALES_ITEM_STATUS');

  React.useEffect(() => {
    if (warehouses.length > 0 && !hasInitializedWarehouseFilter.current) {
      hasInitializedWarehouseFilter.current = true;
      setSelectedWarehouseIds(new Set(warehouses.filter((w) => w.id).map((w) => w.id!.toString())));
    }
  }, [warehouses]);

  // 판매예약, 판매, 판매완료만 필터에 표시 (판매취소 제외 - 목록에서 안 보이게)
  const filterableStatusCodes = React.useMemo(
    () =>
      salesItemStatusCodes.filter(
        (c) =>
          (c.value || c.name || '') &&
          String(c.value || c.name || '') !== 'SALES_CANCELLED' &&
          String(c.value || c.name || '') !== 'SALES_ITEM_CANCELLED',
      ),
    [salesItemStatusCodes],
  );
  React.useEffect(() => {
    if (filterableStatusCodes.length > 0 && !hasInitializedStatusFilter.current) {
      hasInitializedStatusFilter.current = true;
      setSelectedStatuses(new Set(filterableStatusCodes.map((c) => String(c.value || c.name || ''))));
    }
  }, [filterableStatusCodes]);

  const warehouseParams = React.useMemo(() => {
    const validWarehouses = warehouses.filter((w) => w.id);
    if (validWarehouses.length === 0) return {};
    if (selectedWarehouseIds.size === 0) return { warehouseFilter: 'none' as const };
    if (selectedWarehouseIds.size === validWarehouses.length) return {};
    return {
      warehouseIds: Array.from(selectedWarehouseIds).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n)),
    };
  }, [selectedWarehouseIds, warehouses]);

  const statusParams = React.useMemo(() => {
    if (filterableStatusCodes.length === 0) return {};
    if (selectedStatuses.size === 0) return { statusFilter: 'none' as const };
    return { statuses: Array.from(selectedStatuses) };
  }, [selectedStatuses, filterableStatusCodes]);

  /** 목록 필터와 동일 — 하차지 주소 카카오 보강 API body */
  const backfillFilterPayload = React.useMemo(
    () => ({
      ...statusParams,
      ...warehouseParams,
      search: search?.trim() || undefined,
      ...(includeCancelledSales ? { includeCancelled: true } : {}),
      ...(selectedSalesPriceStage.trim() ? { salesUnitPriceStage: selectedSalesPriceStage.trim() } : {}),
    }),
    [statusParams, warehouseParams, search, includeCancelledSales, selectedSalesPriceStage],
  );

  React.useEffect(() => {
    if (!backfillConfirmOpen) {
      setBackfillEligibleCount(null);
      return;
    }
    let cancelled = false;
    setBackfillPreviewLoading(true);
    (async () => {
      try {
        const { data } = await api.post('/sales/dev/backfill-unloading-address-structured', {
          ...backfillFilterPayload,
          dryRun: true,
        });
        if (!cancelled) {
          setBackfillEligibleCount(typeof data?.eligibleCount === 'number' ? data.eligibleCount : 0);
        }
      } catch (err) {
        const ax = err as AxiosError<{ message?: string | string[] }>;
        const msg =
          (typeof ax.response?.data?.message === 'string' && ax.response.data.message) ||
          ax.message ||
          '대상 건수를 확인할 수 없습니다.';
        if (!cancelled) {
          toast({ title: '하차지 주소 보강', description: msg, variant: 'destructive' });
          setBackfillEligibleCount(null);
        }
      } finally {
        if (!cancelled) setBackfillPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backfillConfirmOpen, backfillFilterPayload]);

  const runBackfill = async () => {
    setBackfillRunLoading(true);
    try {
      const { data } = await api.post<SalesUnloadingBackfillResult>(
        '/sales/dev/backfill-unloading-address-structured',
        { ...backfillFilterPayload, dryRun: false },
      );
      setBackfillResult(data);
      setBackfillConfirmOpen(false);
      setBackfillResultOpen(true);
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({
        title: '하차지 주소 보강 완료',
        description: `성공 ${data.successCount}건 · 실패 ${data.failureCount}건`,
      });
    } catch (err) {
      const ax = err as AxiosError<{ message?: string | string[] }>;
      const msg =
        (typeof ax.response?.data?.message === 'string' && ax.response.data.message) ||
        ax.message ||
        '처리에 실패했습니다.';
      toast({ title: '하차지 주소 보강', description: msg, variant: 'destructive' });
    } finally {
      setBackfillRunLoading(false);
    }
  };

  const { data: salesResponse, isLoading } = useSales({
    page,
    limit: pageSize,
    search: search?.trim() || undefined,
    sortBy: sortByApiField(sortBy),
    sortOrder,
    ...statusParams,
    ...warehouseParams,
    ...(includeCancelledSales ? { includeCancelled: true } : {}),
    ...(selectedSalesPriceStage.trim() ? { salesUnitPriceStage: selectedSalesPriceStage.trim() } : {}),
  });

  const salesData = salesResponse?.data || [];
  const total = salesResponse?.total || 0;
  const totalPages = (salesResponse?.totalPages ?? Math.ceil(total / pageSize)) || 1;

  // BK/BL 검색은 백엔드에서 처리되므로 API 결과 그대로 사용
  const sales = salesData;

  const { data: deliveryStatusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: salesPriceStageCodes = [] } = useCodeMastersByGroup('SALES_PRICE_STAGE');

  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (salesItemStatusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [salesItemStatusCodes]);

  const deliveryStatusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (deliveryStatusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [deliveryStatusCodes]);

  const getDeliveryStatusLabel = (status?: string | null) => {
    if (!status) return '-';
    return deliveryStatusMap.get(status) || status;
  };

  const productMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (productCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [productCodes]);

  const getStatusLabel = (status?: string | null) => {
    if (!status) return '-';
    return statusMap.get(status) || status;
  };

  const getProductName = (productCode?: string | null) => {
    if (!productCode) return '-';
    return productMap.get(productCode) || productCode;
  };

  const salesPriceStageMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (salesPriceStageCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [salesPriceStageCodes]);

  const getSalesPriceStageName = (code?: string | null) => {
    if (!code) return '-';
    return salesPriceStageMap.get(code) || code;
  };

  const handleSubmit = async (data: any) => {
    if (drawerMode === 'create') {
      // SalesFormData를 CreateSalesDto로 변환
      const payload: CreateSalesDto = {
        customerId: data.customerId || null,
        phone: data.phone || undefined,
        companyName: data.companyName || undefined,
        ceo: data.ceo || undefined,
        region: data.region || undefined,
        customerPostalCode: data.customerPostalCode || undefined,
        customerAddress: data.customerAddress || undefined,
        customerAddressRoad: data.customerAddressRoad || undefined,
        customerAddressJibun: data.customerAddressJibun || undefined,
        customerLegalBCode: data.customerLegalBCode || undefined,
        customerAddressDefaultType: data.customerAddressDefaultType || undefined,
        customerCity: data.customerCity || undefined,
        addressDetail: data.addressDetail || undefined,
        unloadingPostalCode: data.unloadingPostalCode?.trim() ?? '',
        unloadingAddress: data.unloadingAddress?.trim() ?? '',
        unloadingAddressRoad: data.unloadingAddressRoad?.trim() ?? '',
        unloadingAddressJibun: data.unloadingAddressJibun?.trim() ?? '',
        unloadingLegalBCode:
          data.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) ?? '',
        unloadingAddressDetail: data.unloadingAddressDetail?.trim() ?? '',
        unloadingRegion: data.unloadingRegion?.trim() ?? '',
        unloadingCity: data.unloadingCity?.trim() ?? '',
        unloadingDeliveryAddressId: data.unloadingDeliveryAddressId?.trim() || null,
        reservationDate: data.reservationDate && data.reservationDate.trim() ? data.reservationDate.trim() : undefined,
        salesDate: data.salesDate && data.salesDate.trim() ? data.salesDate.trim() : undefined,
        requestVehicle: data.requestVehicle || null,
        transportFee: data.transportFee ?? null,
        advancePaymentRatio: data.advancePaymentRatio ?? null,
        advancePaymentAmount: data.advancePaymentAmount ?? null,
        registerAs: data.registerAs ?? undefined, // 예약 등록(RESERVED) / 판매 등록(SALE)
        items: (data.selectedContainers || []).map((container: any) => ({
          containerId: container.id,
          containerType: container.containerType || 'CONTAINER',
          cargoBales: container.cargoBales ?? null,
          cargoWeight: container.cargoWeight ?? null,
          stoCost: container.stoCost ?? null,
          dtCost: container.dtCost ?? null,
          workFee: container.workFee ?? null,
          onsiteWorkFee: container.onsiteWorkFee ?? null,
          advancePaymentRatio: container.advancePaymentRatio ?? null,
          margin: container.margin ?? null,
          salesUnitPrice: container.salesUnitPrice ?? null,
          salesUnitPriceStage: container.salesUnitPriceStage ?? null,
          status: null, // 백엔드에서 registerAs 또는 입고상태로 결정
        })),
      };

      await createSalesMutation.mutateAsync(payload);
    } else if (drawerMode === 'edit' && drawerSalesId) {
      // SalesFormData를 UpdateSalesDto로 변환
      const payload: UpdateSalesDto = {
        customerId: data.customerId || null,
        phone: data.phone || undefined,
        companyName: data.companyName || undefined,
        ceo: data.ceo || undefined,
        region: data.region || undefined,
        customerPostalCode: data.customerPostalCode || undefined,
        customerAddress: data.customerAddress || undefined,
        customerAddressRoad: data.customerAddressRoad || undefined,
        customerAddressJibun: data.customerAddressJibun || undefined,
        customerLegalBCode: data.customerLegalBCode || undefined,
        customerAddressDefaultType: data.customerAddressDefaultType || undefined,
        customerCity: data.customerCity || undefined,
        addressDetail: data.addressDetail || undefined,
        unloadingPostalCode: data.unloadingPostalCode?.trim() ?? '',
        unloadingAddress: data.unloadingAddress?.trim() ?? '',
        unloadingAddressRoad: data.unloadingAddressRoad?.trim() ?? '',
        unloadingAddressJibun: data.unloadingAddressJibun?.trim() ?? '',
        unloadingLegalBCode:
          data.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) ?? '',
        unloadingAddressDetail: data.unloadingAddressDetail?.trim() ?? '',
        unloadingRegion: data.unloadingRegion?.trim() ?? '',
        unloadingCity: data.unloadingCity?.trim() ?? '',
        unloadingDeliveryAddressId: data.unloadingDeliveryAddressId?.trim() || null,
        reservationDate: data.reservationDate && data.reservationDate.trim() ? data.reservationDate.trim() : undefined,
        salesDate: data.salesDate && data.salesDate.trim() ? data.salesDate.trim() : undefined,
        requestVehicle: data.requestVehicle || null,
        transportFee: data.transportFee ?? null,
        advancePaymentRatio: data.advancePaymentRatio ?? null,
        advancePaymentAmount: data.advancePaymentAmount ?? null,
        items: (data.selectedContainers || []).map((container: any, index: number) => {
          // 기존 항목 ID는 SalesFormDrawer에서 처리하므로 여기서는 container.itemId 사용
          return {
            id: container.itemId,
            containerId: container.containerId || container.id || '',
            containerType: container.containerType || 'CONTAINER',
            cargoBales: container.cargoBales ?? null,
            cargoWeight: container.cargoWeight ?? null,
            stoCost: container.stoCost ?? null,
            dtCost: container.dtCost ?? null,
            workFee: container.workFee ?? null,
            onsiteWorkFee: container.onsiteWorkFee ?? null,
            advancePaymentRatio: container.advancePaymentRatio ?? null,
            margin: container.margin ?? null,
            salesUnitPrice: container.salesUnitPrice ?? null,
            salesUnitPriceStage: container.salesUnitPriceStage ?? null,
            status: container.status ?? null, // 판매 항목 상태 전송
          };
        }),
      };

      await updateSalesMutation.mutateAsync({ id: drawerSalesId, data: payload });
    } else if (drawerMode === 'confirm' && drawerSalesId) {
      // SalesFormData를 UpdateSalesDto로 변환 (판매 확정)
      const payload: UpdateSalesDto = {
        customerId: data.customerId || null,
        phone: data.phone || undefined,
        companyName: data.companyName || undefined,
        ceo: data.ceo || undefined,
        region: data.region || undefined,
        customerPostalCode: data.customerPostalCode || undefined,
        customerAddress: data.customerAddress || undefined,
        customerAddressRoad: data.customerAddressRoad || undefined,
        customerAddressJibun: data.customerAddressJibun || undefined,
        customerLegalBCode: data.customerLegalBCode || undefined,
        customerAddressDefaultType: data.customerAddressDefaultType || undefined,
        customerCity: data.customerCity || undefined,
        addressDetail: data.addressDetail || undefined,
        unloadingPostalCode: data.unloadingPostalCode?.trim() ?? '',
        unloadingAddress: data.unloadingAddress?.trim() ?? '',
        unloadingAddressRoad: data.unloadingAddressRoad?.trim() ?? '',
        unloadingAddressJibun: data.unloadingAddressJibun?.trim() ?? '',
        unloadingLegalBCode:
          data.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) ?? '',
        unloadingAddressDetail: data.unloadingAddressDetail?.trim() ?? '',
        unloadingRegion: data.unloadingRegion?.trim() ?? '',
        unloadingCity: data.unloadingCity?.trim() ?? '',
        unloadingDeliveryAddressId: data.unloadingDeliveryAddressId?.trim() || null,
        reservationDate: data.reservationDate && data.reservationDate.trim() ? data.reservationDate.trim() : (data.reservationDate === '' ? null : undefined),
        salesDate: data.salesDate && data.salesDate.trim() ? data.salesDate.trim() : (data.salesDate === '' ? null : undefined),
        requestVehicle: data.requestVehicle || null,
        transportFee: data.transportFee ?? null,
        advancePaymentRatio: data.advancePaymentRatio ?? null,
        advancePaymentAmount: data.advancePaymentAmount ?? null,
        items: (data.selectedContainers || []).map((container: any, index: number) => {
          // 기존 항목 ID는 SalesFormDrawer에서 처리하므로 여기서는 container.itemId 사용
          console.log(`[판매 확정] 항목 ${index + 1}:`, {
            containerId: container.containerId || container.id,
            itemId: container.itemId,
            id: container.id,
            전체container: container,
          });
          return {
            id: container.itemId,
            containerId: container.containerId || container.id || '',
            containerType: container.containerType || 'CONTAINER',
            cargoBales: container.cargoBales ?? null,
            cargoWeight: container.cargoWeight ?? null,
            stoCost: container.stoCost ?? null,
            dtCost: container.dtCost ?? null,
            workFee: container.workFee ?? null,
            onsiteWorkFee: container.onsiteWorkFee ?? null,
            advancePaymentRatio: container.advancePaymentRatio ?? null,
            margin: container.margin ?? null,
            salesUnitPrice: container.salesUnitPrice ?? null,
            salesUnitPriceStage: container.salesUnitPriceStage ?? null,
            status: container.status ?? null, // 판매 항목 상태 전송
          };
        }),
      };

      await confirmSalesMutation.mutateAsync({ id: drawerSalesId, data: payload });
    }
    setDrawerOpen(false);
    setDetailDrawerOpen(false);
  };

  const handleEditDrawerOpen = (salesId: string) => {
    setDrawerSalesId(salesId);
    setDrawerMode('edit');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleConfirmDrawerOpen = (salesId: string) => {
    setDrawerSalesId(salesId);
    setDrawerMode('confirm');
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const handleRowClick = (sales: Sales) => {
    setSelectedSalesId(sales.id);
    setDetailDrawerOpen(true);
  };

  const handleCopySales = (salesDetail: SalesDetail) => {
    // 복사할 필드만 추출 (제품 정보는 제외)
    const initialData = {
      customerId: salesDetail.customerId ?? null,
      phone: salesDetail.customerPhone ?? '',
      companyName: salesDetail.customerName ?? '',
      ceo: salesDetail.customerCeo ?? '',
      region: salesDetail.customerRegion ?? '',
      customerPostalCode: salesDetail.customerPostalCode ?? '',
      customerAddress: salesDetail.customerAddress ?? '',
      customerCity: salesDetail.customerCity ?? '',
      addressDetail: salesDetail.customerAddressDetail ?? '',
      unloadingPostalCode: salesDetail.unloadingPostalCode ?? '',
      unloadingAddress: salesDetail.unloadingAddress ?? '',
      unloadingAddressDetail: salesDetail.unloadingAddressDetail ?? '',
      unloadingRegion: salesDetail.unloadingRegion ?? '',
      unloadingCity: salesDetail.unloadingCity ?? '',
      reservationDate: salesDetail.reservationDate ?? '',
      salesDate: salesDetail.salesDate ?? '',
      requestVehicle: salesDetail.requestVehicle ?? null,
      transportFee: salesDetail.transportFee ?? null,
      advancePaymentRatio: salesDetail.advancePaymentRatio ?? null,
      advancePaymentAmount: salesDetail.advancePaymentAmount ?? null,
    };
    
    setCopyInitialData(initialData);
    setDrawerMode('create');
    setDrawerSalesId(null);
    setDrawerOpen(true);
    setDetailDrawerOpen(false);
  };

  const columns: ColumnDef<Sales>[] = React.useMemo(() => [
    {
      id: 'status',
      accessorKey: 'status',
      header: '상태',
      enableSorting: true,
      cell: ({ row }) => {
        const inv = row.original;
        const status = inv.status;
        const cancelledAt = inv.cancelledAt;

        // 전체 판매 취소된 건: "판매 취소" 뱃지 표시 (최우선)
        if (cancelledAt) {
          return (
            <Badge
              variant="outline"
              className="shrink-0 border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300"
            >
              판매 취소
            </Badge>
          );
        }

        const statusLabel = getStatusLabel(status);
        const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
          SALES_ITEM_RESERVED: {
            variant: 'outline',
            className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
          },
          SALES_ITEM_SOLD: {
            variant: 'outline',
            className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
          },
          SALES_ITEM_CANCELLED: {
            variant: 'outline',
            className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
          },
          SALES_ITEM_COMPLETED: {
            variant: 'outline',
            className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
          },
        };

        if (!status || !statusStyles[status]) {
          return (
            <Badge variant="outline" className="border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300">
              {statusLabel}
            </Badge>
          );
        }

        const style = statusStyles[status];
        return (
          <Badge variant={style.variant} className={style.className}>
            {statusLabel}
          </Badge>
        );
      },
      size: 80,
    },
    {
      id: 'deliveryStatus',
      accessorKey: 'deliveryStatus',
      header: '운송 상태',
      enableSorting: false,
      cell: ({ row }) => {
        const status = row.original.status;
        const deliveryStatus = row.original.deliveryStatus;
        // 판매예약이면 운송상태 비움 (운송 데이터 없음/미생성)
        const isReservation = status === 'RESERVED' || status === 'SALES_ITEM_RESERVED';
        if (isReservation || !deliveryStatus) {
          return <span className="text-sm text-muted-foreground">미생성</span>;
        }
        const statusLabel = getDeliveryStatusLabel(deliveryStatus);
        // 운송관리(sales/transport-management/transport)와 동일한 상태별 스타일
        const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
          PENDING_DISPATCH: {
            variant: 'outline',
            className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
          },
          DISPATCH_REQUESTED: {
            variant: 'outline',
            className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
          },
          DISPATCH_COMPLETED: {
            variant: 'outline',
            className: 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300',
          },
          LOADING: {
            variant: 'outline',
            className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
          },
          LOADING_COMPLETED: {
            variant: 'outline',
            className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
          },
          UNLOADING_COMPLETED: {
            variant: 'outline',
            className: 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300',
          },
          FAILED: {
            variant: 'outline',
            className: 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300',
          },
          RESCHEDULED: {
            variant: 'outline',
            className: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
          },
        };
        const style = statusStyles[deliveryStatus]
          ? statusStyles[deliveryStatus]
          : { variant: 'outline' as const, className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300' };
        return (
          <Badge variant={style.variant} className={style.className}>
            {statusLabel}
          </Badge>
        );
      },
      size: 80,
    },
    {
      id: 'reservationOrSalesDate',
      accessorKey: 'reservationDate',
      header: '예약일/판매일',
      enableSorting: true,
      cell: ({ row }) => {
        const status = row.original.status;
        const reservationDate = row.original.reservationDate;
        const salesDate = row.original.salesDate;
        // 판매예약일 때는 예약일, 나머지(판매 등)는 판매일 표시
        const isReservation = status === 'RESERVED' || status === 'SALES_ITEM_RESERVED';
        const displayDate = isReservation ? reservationDate : salesDate;
        if (displayDate) {
          return <div className="text-sm">{formatDate(displayDate)}</div>;
        }
        return <div className="text-sm text-muted-foreground">-</div>;
      },
      size: 100,
    },
    {
      id: 'customerName',
      accessorKey: 'customerName',
      header: '고객명',
      enableSorting: true,
      cell: ({ row }) => {
        const value = row.original.customerName || '-';
        return <div className="text-sm truncate" title={value}>{value}</div>;
      },
      size: 170,
    },
    {
      id: 'productInfo',
      header: '상품 정보',
      enableSorting: false,
      cell: ({ row }) => {
        const productInfo = row.original.productInfo || [];
        if (productInfo.length === 0) {
          return <div className="text-sm text-muted-foreground">-</div>;
        }
        return (
          <div className="rounded-md border border-border w-full min-w-0 select-text">
            <table className="w-full text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '4%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '5%' }} />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">ETA</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">창고</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">입고상태</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">BL</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">컨테이너</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">상품명</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">패킹 타입</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">등급(영업)</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">타입</th>
                  <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">베일</th>
                  <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">중량(KG)</th>
                  <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">환율</th>
                  <th className="text-left py-1.5 px-2 font-medium border-r border-border last:border-r-0">구분</th>
                  <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">판매단가</th>
                  <th className="text-right py-1.5 px-2 font-medium border-r border-border last:border-r-0">마진</th>
                </tr>
              </thead>
              <tbody>
                {productInfo.map((product, idx) => {
                  const etaStr = product.etaDate ? formatDateMonthDay(product.etaDate) : '-';
                  const warehouseName = product.inboundWarehouseName || product.inboundWarehouse || '-';
                  const inboundStatus = product.inboundStatus;
                  const inboundLabel = inboundStatus === 'INBOUND_PENDING' ? '입고대기' : inboundStatus === 'INBOUND_SCHEDULED' ? '입고예정' : inboundStatus === 'INBOUND_CONFIRMED' ? '입고확정' : '-';
                  const inboundBadgeClass =
                    inboundStatus === 'INBOUND_PENDING'
                      ? 'text-xs border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300'
                      : inboundStatus === 'INBOUND_SCHEDULED'
                        ? 'text-xs border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                        : inboundStatus === 'INBOUND_CONFIRMED'
                          ? 'text-xs border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300'
                          : '';
                  const bl = product.bl || '-';
                  const containerNo = product.containerNo
                    ? product.sequence != null
                      ? `${product.containerNo} [${product.sequence}]`
                      : product.containerNo
                    : '-';
                  const productName = getProductName(product.productName);
                  const packingName = product.packingName || product.packingType || '-';
                  const salesGrade = product.salesGradeName || product.salesGrade || '-';
                  const typeLabel = product.containerType === 'CARGO' ? '카고' : '컨테이너';
                  const bales = product.salesBales ?? product.tradeBales ?? product.bales;
                  const balesStr = bales != null ? Math.round(Number(bales)).toLocaleString('ko-KR') : '-';
                  const weightKg = product.weight != null ? formatNumber(product.weight * 1000, 0) : '-';
                  const exchangeRateStr = product.exchangeRate != null ? formatNumber(product.exchangeRate, 0) : '-';
                  const salesUnitPriceStr = product.salesUnitPrice != null ? formatNumber(product.salesUnitPrice, 0) : '-';
                  const marginStr = product.margin != null ? formatNumber(product.margin, 2) : '-';
                  return (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">{etaStr}</td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">{warehouseName}</td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">
                        {inboundLabel !== '-' ? (
                          <Badge variant="outline" className={inboundBadgeClass || 'text-xs'}>
                            {inboundLabel}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">{bl}</td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">{containerNo}</td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">{productName}</td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">{packingName}</td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">{salesGrade}</td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">{typeLabel}</td>
                      <td className="py-1 px-2 text-right overflow-hidden text-ellipsis border-r border-border last:border-r-0">{balesStr}</td>
                      <td className="py-1 px-2 text-right overflow-hidden text-ellipsis border-r border-border last:border-r-0">{weightKg}</td>
                      <td className="py-1 px-2 text-right overflow-hidden text-ellipsis border-r border-border last:border-r-0">{exchangeRateStr}</td>
                      <td className="py-1 px-2 overflow-hidden text-ellipsis border-r border-border last:border-r-0">
                        {product.salesUnitPriceStage ? (
                          <Badge
                            variant="outline"
                            className={
                              product.salesUnitPriceStage === 'LOADING'
                                ? 'text-xs border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                                : product.salesUnitPriceStage === 'ARRIVAL'
                                  ? 'text-xs border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300'
                                  : product.salesUnitPriceStage === 'UNLOADING'
                                    ? 'text-xs border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300'
                                    : 'text-xs border-slate-500 bg-slate-50 text-slate-700 dark:border-slate-400 dark:bg-slate-950/30 dark:text-slate-300'
                            }
                          >
                            {getSalesPriceStageName(product.salesUnitPriceStage)}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-1 px-2 text-right overflow-hidden text-ellipsis border-r border-border last:border-r-0">{salesUnitPriceStr}</td>
                      <td className="py-1 px-2 text-right overflow-hidden text-ellipsis border-r border-border last:border-r-0">{marginStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      },
      size: 1200,
    },
    {
      id: 'transportFee',
      accessorKey: 'transportFee',
      header: '운송비',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm text-right tabular-nums">
          {formatNumber(row.original.transportFee, 2)}
        </div>
      ),
      size: 96,
    },
    // {
    //   id: 'totalAmount',
    //   header: '총 금액',
    //   enableSorting: false,
    //   cell: ({ row }) => {
    //     const productInfo = row.original.productInfo || [];
    //     const totalAmount = productInfo.reduce((sum, product) => {
    //       // 판매가 = 판매단가 * 중량 * 1000
    //       if (product.salesUnitPrice && product.weight) {
    //         return sum + (product.salesUnitPrice * product.weight * 1000);
    //       }
    //       return sum;
    //     }, 0);
        
    //     return (
    //       <div className="text-sm text-right font-medium">
    //         {totalAmount > 0 ? totalAmount.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
    //       </div>
    //     );
    //   },
    //   size: 120,
    // },
    {
      accessorKey: 'registeredByName',
      header: '등록자',
      enableSorting: false,
      cell: ({ row }) => <div className="text-sm">{row.original.registeredByName || '-'}</div>,
      size: 100,
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: '등록일시',
      enableSorting: true,
      cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.createdAt)}</div>,
      size: 165,
    },
    {
      id: 'updatedAt',
      accessorKey: 'updatedAt',
      header: '수정일시',
      enableSorting: false,
      cell: ({ row }) => <div className="text-sm">{formatDateTime(row.original.updatedAt)}</div>,
      size: 165,
    },
  ], [router, statusMap, deliveryStatusMap, productMap, getStatusLabel, getDeliveryStatusLabel, getProductName, getSalesPriceStageName]);

  const handleFilterKeyDown = (e: React.KeyboardEvent, nextId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (document.getElementById(nextId) as HTMLElement | null)?.focus();
    }
  };

  const filterControls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          검색
        </Label>
        <Input
          id="search"
          value={search}
          placeholder="업체명, 고객명, BK, BL, 컨테이너번호, 상품 검색"
          className="w-56 md:w-64"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          onKeyDown={(e) => handleFilterKeyDown(e, 'statusFilter')}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상태</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {selectedStatuses.size === 0
                ? '선택 안됨'
                : selectedStatuses.size === filterableStatusCodes.length
                  ? '전체'
                  : `${selectedStatuses.size}개 선택됨`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                  <Checkbox
                    id="status-filter-all"
                    checked={selectedStatuses.size === filterableStatusCodes.length}
                    onCheckedChange={(checked: boolean) => {
                      const validValues = filterableStatusCodes.map((c) => String(c.value || c.name || ''));
                      if (checked) {
                        setSelectedStatuses(new Set(validValues));
                      } else {
                        setSelectedStatuses(new Set());
                      }
                      setPage(1);
                    }}
                  />
                  <Label htmlFor="status-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                    전체
                  </Label>
                </div>
                {filterableStatusCodes.map((code) => {
                  const value = String(code.value || code.name || '');
                  if (!value) return null;
                  return (
                    <div key={value} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                      <Checkbox
                        id={`status-filter-${value}`}
                        checked={selectedStatuses.has(value)}
                        onCheckedChange={(checked: boolean) => {
                          const next = new Set(selectedStatuses);
                          if (checked) next.add(value);
                          else next.delete(value);
                          setSelectedStatuses(next);
                          setPage(1);
                        }}
                      />
                      <Label htmlFor={`status-filter-${value}`} className="text-sm font-medium cursor-pointer flex-1">
                        {code.name || code.value}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">창고</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
              <Filter className="mr-2 h-4 w-4" />
              {selectedWarehouseIds.size === 0
                ? '선택 안됨'
                : selectedWarehouseIds.size === warehouses.filter((w) => w.id).length
                  ? '전체'
                  : `${selectedWarehouseIds.size}개 선택됨`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                  <Checkbox
                    id="warehouse-filter-all"
                    checked={selectedWarehouseIds.size === warehouses.filter((w) => w.id).length}
                    onCheckedChange={(checked: boolean) => {
                      const validIds = warehouses.filter((w) => w.id).map((w) => w.id!.toString());
                      if (checked) {
                        setSelectedWarehouseIds(new Set(validIds));
                      } else {
                        setSelectedWarehouseIds(new Set());
                      }
                      setPage(1);
                    }}
                  />
                  <Label htmlFor="warehouse-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                    전체
                  </Label>
                </div>
                {warehouses.filter((w) => w.id).map((warehouse) => (
                  <div key={warehouse.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                    <Checkbox
                      id={`warehouse-filter-${warehouse.id}`}
                      checked={selectedWarehouseIds.has(warehouse.id!.toString())}
                      onCheckedChange={(checked: boolean) => {
                        const newIds = new Set(selectedWarehouseIds);
                        if (checked) {
                          newIds.add(warehouse.id!.toString());
                        } else {
                          newIds.delete(warehouse.id!.toString());
                        }
                        setSelectedWarehouseIds(newIds);
                        setPage(1);
                      }}
                    />
                    <Label
                      htmlFor={`warehouse-filter-${warehouse.id}`}
                      className="text-sm font-medium cursor-pointer flex-1"
                    >
                      {warehouse.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="sales-price-stage-filter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
          구분
        </Label>
        <Select
          value={selectedSalesPriceStage.trim() ? selectedSalesPriceStage.trim() : '__all__'}
          onValueChange={(v) => {
            setSelectedSalesPriceStage(v === '__all__' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger id="sales-price-stage-filter" className="h-8 w-[9.5rem]">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체</SelectItem>
            {(salesPriceStageCodes ?? []).map((c) => {
              const value = String(c.value || c.name || '').trim();
              if (!value) return null;
              return (
                <SelectItem key={value} value={value}>
                  {(c.name || c.value || '').trim() || value}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="include-cancelled-sales"
          checked={includeCancelledSales}
          onCheckedChange={(checked) => {
            setIncludeCancelledSales(checked === true);
            setPage(1);
          }}
        />
        <Label htmlFor="include-cancelled-sales" className="text-sm font-medium text-muted-foreground cursor-pointer">
          취소 건 포함
        </Label>
      </div>
    </div>
  );

  return (
    <AppLayout user={user}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">판매관리</h1>
            <p className="text-sm text-muted-foreground">판매 정보를 관리합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="현재 목록 필터와 동일 조건. 레거시 하차지 주소는 유지하고 도로명·지번·법정동만 채웁니다."
              onClick={() => setBackfillConfirmOpen(true)}
            >
              <MapPin className="mr-2 h-4 w-4" />
              하차지 주소 보강
            </Button>
            <Button
              onClick={() => {
                setDrawerMode('create');
                setDrawerSalesId(null);
                setDrawerOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              판매등록
            </Button>
          </div>
        </div>

        <AlertDialog
          open={backfillConfirmOpen}
          onOpenChange={(open) => {
            setBackfillConfirmOpen(open);
            if (!open) setBackfillEligibleCount(null);
          }}
        >
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>하차지 주소 보강 (카카오)</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    위 검색·상태·창고·구분·취소 포함 여부 필터와{' '}
                    <strong className="text-foreground">동일한 조건</strong>의 판매만 대상으로 합니다.
                  </p>
                  <p>
                    <code className="text-xs">sa_unloading_address</code> 레거시 한 줄 주소는{' '}
                    <strong className="text-foreground">변경하지 않습니다</strong>. 비어 있는 도로명·지번·법정동코드만
                    채웁니다.
                  </p>
                  <p className="flex items-center gap-2 pt-1 text-foreground">
                    {backfillPreviewLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        대상 건수 확인 중…
                      </>
                    ) : backfillEligibleCount !== null ? (
                      <>보강 대상(추정): <strong>{backfillEligibleCount}건</strong></>
                    ) : (
                      <>대상 건수를 불러오지 못했습니다. 닫고 다시 시도해 주세요.</>
                    )}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={backfillRunLoading}>취소</AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  backfillPreviewLoading ||
                  backfillEligibleCount === null ||
                  backfillRunLoading ||
                  backfillEligibleCount === 0
                }
                onClick={(e) => {
                  e.preventDefault();
                  void runBackfill();
                }}
              >
                {backfillRunLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    처리 중…
                  </>
                ) : (
                  '실행'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={backfillResultOpen} onOpenChange={setBackfillResultOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>하차지 주소 보강 결과</DialogTitle>
              <DialogDescription>
                {backfillResult
                  ? `대상 ${backfillResult.eligibleCount}건 중 성공 ${backfillResult.successCount}건, 실패 ${backfillResult.failureCount}건`
                  : ''}
              </DialogDescription>
            </DialogHeader>
            {backfillResult && (
              <div className="space-y-3 min-h-0 flex-1 flex flex-col">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="text-muted-foreground">성공</div>
                    <div className="text-lg font-semibold text-green-700 dark:text-green-400">
                      {backfillResult.successCount}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="text-muted-foreground">실패</div>
                    <div className="text-lg font-semibold text-red-700 dark:text-red-400">
                      {backfillResult.failureCount}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-2">
                    <div className="text-muted-foreground">처리 시도</div>
                    <div className="text-lg font-semibold">{backfillResult.processed}</div>
                  </div>
                </div>
                {backfillResult.failures.length > 0 ? (
                  <div className="flex flex-col min-h-0 flex-1 gap-2">
                    <p className="text-sm font-medium">실패 목록</p>
                    <ScrollArea className="h-[min(360px,40vh)] rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                          <tr className="border-b text-left">
                            <th className="p-2 w-20">판매 ID</th>
                            <th className="p-2">레거시 주소(일부)</th>
                            <th className="p-2">사유</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backfillResult.failures.map((f) => (
                            <tr key={f.salesId} className="border-b align-top">
                              <td className="p-2 font-mono whitespace-nowrap">{f.salesId}</td>
                              <td className="p-2 break-all text-muted-foreground">
                                {f.legacyAddressPreview || '—'}
                                {f.lastQueryTried ? (
                                  <div className="mt-1 text-[10px] text-muted-foreground">
                                    검색 시도: {f.lastQueryTried}
                                  </div>
                                ) : null}
                              </td>
                              <td className="p-2 break-words">{f.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">실패한 건이 없습니다.</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setBackfillResultOpen(false)}>
                닫기
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DataTable
          data={sales}
          columns={columns}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
            Cookies.set('data-table-page-size', newSize.toString());
          }}
          filterControls={filterControls}
          onRowClick={handleRowClick}
          skipTruncateColumnIds={['productInfo']}
          manualPagination={true}
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          getRowClassName={(row) =>
            isUpdatedWithin5Minutes(row.updatedAt)
              ? 'bg-yellow-100 dark:bg-yellow-950/50 hover:!bg-yellow-200 dark:hover:!bg-yellow-900/60'
              : undefined
          }
        />

        <SalesFormDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) {
              setDrawerSalesId(null);
              setDrawerMode('create');
              setCopyInitialData(null);
            }
          }}
          mode={drawerMode}
          salesId={drawerSalesId}
          onSubmit={handleSubmit}
          isSubmitting={drawerMode === 'create' ? createSalesMutation.isPending : drawerMode === 'edit' ? updateSalesMutation.isPending : confirmSalesMutation.isPending}
          initialData={copyInitialData ?? undefined}
        />

        <SalesDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={setDetailDrawerOpen}
          salesId={selectedSalesId}
          onCopySales={handleCopySales}
        />
      </div>
    </AppLayout>
  );
}

export default function SalesPage() {
  return (
    <React.Suspense fallback={null}>
      <SalesPageContent />
    </React.Suspense>
  );
}
