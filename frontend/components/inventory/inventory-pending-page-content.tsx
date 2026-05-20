'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import api from '@/lib/api';
import { useContainersPending } from '@/lib/hooks/use-trade-contracts';
import { useCodesByCategory, type Code } from '@/lib/hooks/use-codes';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Eye, EyeOff, Filter } from 'lucide-react';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { useToast } from '@/components/ui/use-toast';
import { InventoryPendingDetailDrawer } from '@/components/inventory/inventory-pending-detail-drawer';

// 컨테이너 타입 정의
type Container = {
  id: string;
  containerNo: string;
  bales: number | null; // 원본 베일 수량
  salesBales?: number | null; // 영업 베일
  tradeBales?: number | null; // 무역 베일
  availableBales: number | null; // 판매 수량 차감 후 가용 베일 수량
  soldBales: number | null; // 판매된 베일 수량
  weight: number | null; // 원본 중량
  availableWeight: number | null; // 판매 수량 차감 후 가용 중량
  soldWeight: number | null; // 판매된 중량
  orderId: string;
  contractNo: string | null;
  sequence: number;
  orderCount?: number;
  bk: string | null;
  bl: string | null;
  productName: string | null;
  /** 계약/컨 상품 코드 — API `product`, 필터·백엔드 IN과 동일 */
  product?: string | null;
  grade: string | null;
  tradeGrade: string | null;
  salesGrade: string | null;
  packingType: string | null;
  quantity: string | null;
  etaDate: string | null;
  exportCountryName: string | null;
  exporterName: string | null;
  destinationName: string | null;
  finalDestinationName: string | null;
  // 입고 데이터
  inboundStatus: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;
  inboundWarehouse: string | null;
  inboundWarehouseName: string | null;
  inboundIgodate: string | null;
  inboundQuarantineDate: string | null;
  inboundDtDate: string | null;
  // 원가 데이터
  pendingPurchaseCost: string | null;
  // 재고 상태
  inventoryStatus: 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null;
  // 재고 목록 제외 여부 (true면 목록/판매 선택에서 제외, 제외 해제로 복구 가능)
  excludeFromInventory?: boolean;
};

type TradeOrderResponse = {
  id: string;
  sequence: number;
  contractNo: string | null;
  orderCount?: number;
  bk?: string | null;
  bl?: string | null;
  productName?: string | null;
  grade?: string | null;
  packingType?: string | null;
  quantity?: string | null;
  etaDate?: string | null;
  exportCountryName?: string | null;
  exporterName?: string | null;
  destinationName?: string | null;
  finalDestinationName?: string | null;
  salesStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;
  containers?: Array<{
    id: string;
    containerNo: string;
    weight?: string | null;
    tradeGrade?: string | null;
    salesGrade?: string | null;
    pendingPurchaseCost?: string | null;
  }>;
  pendingInbound?: {
    warehouse?: string | null;
    igodate?: string | null;
    quarantineDate?: string | null;
    dtDate?: string | null;
  } | null;
};

export type InventoryPendingPageContentProps = {
  instanceId: string;
};

export function InventoryPendingPageContent({ instanceId }: InventoryPendingPageContentProps) {
  const columnSettings = useColumnSettings(instanceId);
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>('containerNo');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState<string>('');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const productDefaultAppliedRef = React.useRef(false);
  const inventoryPendingProductFilterDomId = React.useId();
  const [selectedInventoryStatuses, setSelectedInventoryStatuses] = useState<Set<string>>(
    new Set(['AVAILABLE', 'RESERVED', 'PARTIALLY_RESERVED', 'PARTIALLY_SOLD', 'PARTIALLY_SOLD_COMPLETED', 'SELLING', 'SOLD_OUT'])
  );
  /** 제외된 재고 포함 여부 (켜면 includeExcluded=true 로 API 호출 → 제외된 항목도 표시, 제외 해제 가능) */
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [excludeActionLoading, setExcludeActionLoading] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  /** 창고 필터 (입고확정과 동일) */
  const [selectedWarehouseValues, setSelectedWarehouseValues] = useState<Set<string>>(new Set());
  const lastWarehouseOptionsLength = React.useRef(0);

  const { toast } = useToast();

  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const { data: gradeCodes } = useCodesByCategory('TRADE_GRADE');
  const { data: salesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');

  const availableProductCodes = useMemo(
    () =>
      productCodes
        .filter((c): c is typeof c & { value: string } => Boolean(c?.value?.trim()))
        .map((c) => c.value.trim())
        .sort((a, b) => a.localeCompare(b)),
    [productCodes],
  );

  const availableProductCodesKey = useMemo(
    () => availableProductCodes.join('\u0001'),
    [availableProductCodes],
  );

  const selectedProductsKeySorted = useMemo(
    () => [...selectedProducts].sort((a, b) => a.localeCompare(b)).join('\u0001'),
    [selectedProducts],
  );

  const allProductsSelected = useMemo(
    () =>
      availableProductCodes.length > 0 &&
      selectedProducts.size === availableProductCodes.length &&
      selectedProductsKeySorted === availableProductCodesKey,
    [
      availableProductCodes.length,
      availableProductCodesKey,
      selectedProducts.size,
      selectedProductsKeySorted,
    ],
  );

  const productsParam = useMemo(() => {
    if (availableProductCodes.length === 0) return undefined;
    if (selectedProducts.size === 0) {
      return productDefaultAppliedRef.current ? [] : undefined;
    }
    if (allProductsSelected) return undefined;
    return Array.from(selectedProducts);
  }, [availableProductCodes.length, allProductsSelected, selectedProducts]);

  // confirmed와 동일 패턴: search, productNames, includeExcluded 변경 시 자동 refetch
  const { data: containersRaw = [], isLoading: isContainersLoading } = useContainersPending({
    search: search || undefined,
    productNames: productsParam,
    includeExcluded,
  });

  useEffect(() => {
    if (availableProductCodes.length === 0 || !availableProductCodesKey) return;
    if (!productDefaultAppliedRef.current) {
      productDefaultAppliedRef.current = true;
      setSelectedProducts(new Set(availableProductCodes));
    }
  }, [availableProductCodesKey]);
  const containers: Container[] = useMemo(
    () =>
      Array.isArray(containersRaw)
        ? containersRaw.map((item: any) => ({
            ...item,
            product: item.product ?? null,
            bales: (item.salesBales ?? item.tradeBales) != null ? Number(item.salesBales ?? item.tradeBales) : null,
            availableBales: item.availableBales != null ? Number(item.availableBales) : null,
            soldBales: item.soldBales != null ? Number(item.soldBales) : null,
            weight: item.weight != null ? Number(item.weight) : null,
            availableWeight: item.availableWeight != null ? Number(item.availableWeight) : null,
            soldWeight: item.soldWeight != null ? Number(item.soldWeight) : null,
            excludeFromInventory: item.excludeFromInventory === true,
          }))
        : [],
    [containersRaw],
  );

  const { data: warehouses = [] } = useWarehouses({ status: true });

  // 창고 필터 옵션 (tb_warehouse 기준)
  const warehouseFilterOptions = useMemo(() => {
    return warehouses
      .filter((w) => w.name?.trim())
      .map((w) => ({ value: w.name!.trim(), label: w.name!.trim() }));
  }, [warehouses]);

  // 창고 필터 기본값: 옵션 개수만 의존해 setState 루프 방지
  const warehouseOptionsLength = warehouseFilterOptions.length;
  useEffect(() => {
    const len = warehouseOptionsLength;
    if (len === 0) return;
    const prevLen = lastWarehouseOptionsLength.current;
    lastWarehouseOptionsLength.current = len;
    setSelectedWarehouseValues((prev) => {
      const isFirstLoad = prev.size === 0;
      const wasAllSelected = prev.size === prevLen;
      if (isFirstLoad || wasAllSelected) {
        return new Set(warehouseFilterOptions.map((o) => o.value));
      }
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- length만 의존해 루프 방지
  }, [warehouseOptionsLength]);

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await auth.getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    void checkAuth();
  }, []);

  const resolveWarehouseLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const w = warehouses.find((w) => w.name === code || w.id.toString() === code);
      return w?.name ?? code;
    },
    [warehouses],
  );

  const resolveDestinationLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const destination = destinationCodes?.find((c) => c.value === code || c.name === code);
      return destination?.name || destination?.value || code;
    },
    [destinationCodes],
  );

  const resolveGradeLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const grade = gradeCodes?.find((c) => c.value === code || c.name === code);
      return grade?.name || grade?.value || code;
    },
    [gradeCodes],
  );

  const resolveSalesGradeLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const grade = salesGradeCodes?.find((c) => c.value === code || c.name === code);
      return grade?.name || grade?.value || code;
    },
    [salesGradeCodes],
  );

  const resolvePackingLabel = useCallback(
    (code: string | null | undefined): string => {
      if (!code) return '-';
      const packingType = packingCodes?.find((c) => c.value === code || c.name === code);
      return packingType?.name || packingType?.value || code;
    },
    [packingCodes],
  );

  /** 재고 목록 제외 / 제외 해제 */
  const handleExcludeFromInventory = useCallback(
    async (containerId: string, exclude: boolean) => {
      try {
        setExcludeActionLoading(containerId);
        await api.patch(`/trade/contracts/containers/${containerId}`, { excludeFromInventory: exclude });
        toast({
          title: exclude ? '재고 목록에서 제외되었습니다.' : '재고 목록에 다시 표시됩니다.',
          description: exclude ? '판매 항목 선택 목록에서도 제외됩니다. 복구는 "제외된 재고 포함"을 켠 뒤 제외 해제를 누르세요.' : undefined,
        });
        await queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'containers', 'pending'] });
      } catch (err: unknown) {
        const message = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
        toast({
          title: '처리 실패',
          description: message || (exclude ? '재고 목록 제외에 실패했습니다.' : '제외 해제에 실패했습니다.'),
          variant: 'destructive',
        });
      } finally {
        setExcludeActionLoading(null);
      }
    },
    [toast, queryClient],
  );

  const handleSortChange = useCallback((column: string, order: 'asc' | 'desc') => {
    setSortBy(column);
    setSortOrder(order);
    setPage(1);
  }, []);

  // 재고 상태 옵션 (confirmed와 동일, 반납여부 없음)
  const inventoryStatusOptions = useMemo(() => [
    { value: 'AVAILABLE', label: '가용' },
    { value: 'RESERVED', label: '예약됨' },
    { value: 'PARTIALLY_RESERVED', label: '부분 예약' },
    { value: 'PARTIALLY_SOLD', label: '부분 판매중' },
    { value: 'PARTIALLY_SOLD_COMPLETED', label: '부분 판매완료' },
    { value: 'SELLING', label: '판매중' },
    { value: 'SOLD_OUT', label: '판매 완료' },
  ], []);

  const sortedContainers = useMemo(() => {
    const sorted = [...containers].sort((a, b) => {
      let aValue: any = a[sortBy as keyof Container];
      let bValue: any = b[sortBy as keyof Container];

      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      if (typeof aValue === 'string') {
        aValue = aValue.toUpperCase();
      }
      if (typeof bValue === 'string') {
        bValue = bValue.toUpperCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [containers, sortBy, sortOrder]);

  // 재고 상태 + 창고 필터링 적용
  const filteredContainers = useMemo(() => {
    let filtered = [...sortedContainers];

    // 상품: 백엔드 IN과 동일 코드 집합(행 `product`)으로 표시 일치 — productName은 표시용 명칭
    if (productsParam !== undefined) {
      if (productsParam.length === 0) {
        return [];
      }
      const allow = new Set(productsParam);
      filtered = filtered.filter((c) => {
        const code = c.product?.trim();
        if (!code) return false;
        return allow.has(code);
      });
    }

    // 창고 필터 (tb_warehouse 기준, inboundWarehouse에 창고명 저장)
    if (selectedWarehouseValues.size < warehouseFilterOptions.length) {
      if (selectedWarehouseValues.size === 0) {
        return [];
      }
      filtered = filtered.filter((container) => {
        const wh = container.inboundWarehouse?.trim();
        return wh && selectedWarehouseValues.has(wh);
      });
    }

    if (selectedInventoryStatuses.size < inventoryStatusOptions.length) {
      if (selectedInventoryStatuses.size === 0) return [];
      filtered = filtered.filter((container) => {
        const status = container.inventoryStatus;
        if (!status) return false;
        return selectedInventoryStatuses.has(status);
      });
    }
    return filtered;
  }, [
    sortedContainers,
    productsParam,
    selectedWarehouseValues,
    warehouseFilterOptions.length,
    selectedInventoryStatuses,
    inventoryStatusOptions.length,
  ]);

  // 수량 표시 헬퍼 (입고 확정 재고와 동일: maxDecimals, 음수/양수 색상은 셀에서 처리)
  const formatQuantity = useCallback((available: number | null, total: number | null, sold: number | null, maxDecimals: number = 3) => {
    if (available == null || total == null) return { text: '-', hasSales: false };
    const hasSales = (sold ?? 0) > 0;
    const fmt = (v: number) =>
      v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
    if (hasSales) {
      return {
        text: `${fmt(available)}/${fmt(total)}`,
        hasSales: true,
        available: fmt(available),
        total: fmt(total),
      };
    }
    return { text: fmt(total), hasSales: false, total: fmt(total) };
  }, []);

  // 전체 데이터와 페이지네이션된 데이터 분리 (useMemo 사용)
  const allContainers = filteredContainers;
  const paginatedContainers = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return allContainers.slice(start, end);
  }, [allContainers, page, pageSize]);

  const total = allContainers.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns: ColumnDef<Container>[] = useMemo(
    () => [
      {
        accessorKey: 'exporterName',
        header: '수출사',
        cell: ({ row }) => {
          const value = row.getValue('exporterName') as string | null;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 90,
      },
      {
        accessorKey: 'exportCountryName',
        header: '수출국',
        cell: ({ row }) => {
          const value = row.getValue('exportCountryName') as string | null;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 80,
      },
      {
        accessorKey: 'productName',
        header: '상품명',
        cell: ({ row }) => {
          const value = row.getValue('productName') as string | null;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 100,
      },
      {
        accessorKey: 'salesGrade',
        header: '등급(영업)',
        cell: ({ row }) => {
          const value = row.getValue('salesGrade') as string | null;
          const label = resolveSalesGradeLabel(value);
          return <div className="truncate" title={label || undefined}>{label || '-'}</div>;
        },
        size: 80,
      },
      {
        accessorKey: 'bk',
        header: 'bk',
        cell: ({ row }) => {
          const value = row.getValue('bk') as string | null;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 140,
      },
      {
        accessorKey: 'bl',
        header: 'bl',
        cell: ({ row }) => {
          const value = row.getValue('bl') as string | null;
          return <div className="font-medium truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 150,
      },
      {
        accessorKey: 'containerNo',
        header: '컨번호',
        cell: ({ row }) => {
          const value = row.getValue('containerNo') as string;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 130,
      },
      {
        accessorKey: 'inboundWarehouse',
        header: '창고',
        cell: ({ row }) => {
          const value = row.getValue('inboundWarehouse') as string | null;
          const label = resolveWarehouseLabel(value);
          return <div className="truncate" title={label || undefined}>{label || '-'}</div>;
        },
        size: 95,
      },
      {
        accessorKey: 'inboundIgodate',
        header: '이고날짜',
        cell: ({ row }) => {
          const value = row.getValue('inboundIgodate') as string | null;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 95,
      },
      {
        accessorKey: 'inboundQuarantineDate',
        header: '검역날짜',
        cell: ({ row }) => {
          const value = row.getValue('inboundQuarantineDate') as string | null;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 95,
      },
      {
        accessorKey: 'inboundDtDate',
        header: '통관예정일',
        cell: ({ row }) => {
          const value = row.getValue('inboundDtDate') as string | null;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 95,
      },
      {
        accessorKey: 'inventoryStatus',
        header: '재고상태',
        cell: ({ row }) => {
          const status = row.getValue('inventoryStatus') as 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null;
          if (!status) return <div>-</div>;
          
          const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string; label: string }> = {
            AVAILABLE: {
              variant: 'outline',
              className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
              label: '가용',
            },
            RESERVED: {
              variant: 'outline',
              className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
              label: '예약됨',
            },
            PARTIALLY_RESERVED: {
              variant: 'outline',
              className: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
              label: '부분 예약',
            },
            PARTIALLY_SOLD: {
              variant: 'outline',
              className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
              label: '부분 판매중',
            },
            PARTIALLY_SOLD_COMPLETED: {
              variant: 'outline',
              className: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
              label: '부분 판매완료',
            },
            SELLING: {
              variant: 'outline',
              className: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
              label: '판매중',
            },
            SOLD_OUT: {
              variant: 'outline',
              className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
              label: '판매 완료',
            },
          };
          
          const style = statusStyles[status];
          if (!style) {
            return <div>{status}</div>;
          }
          
          return (
            <Badge variant={style.variant} className={`${style.className ?? ''} truncate max-w-full`} title={style.label}>
              {style.label}
            </Badge>
          );
        },
        size: 95,
      },
      {
        accessorKey: 'packingType',
        header: '패킹타입',
        cell: ({ row }) => {
          const value = row.getValue('packingType') as string | null;
          const label = resolvePackingLabel(value);
          return <div className="truncate" title={label || undefined}>{label || '-'}</div>;
        },
        size: 80,
      },
      {
        accessorKey: 'availableBales',
        header: '베일(영업)',
        cell: ({ row }) => {
          const availableRaw = row.original.availableBales ?? null;
          const result = formatQuantity(
            availableRaw,
            row.original.bales,
            row.original.soldBales,
            4, // 베일 소수점 4자리 (입고 확정과 동일)
          );
          // 단일 표시는 총 베일만 보여줌 → 가용 음수로 빨간색 처리하면 오해 소지 (재고상태 가용인데 40이 빨갛게 보임)
          const isNegative = result.hasSales && availableRaw != null && availableRaw < 0;
          const displayText = result.hasSales ? `${result.available} / ${result.total}` : result.text;
          if (result.hasSales) {
            return (
              <div className="flex items-center gap-1 truncate justify-end" title={displayText}>
                <span
                  className={
                    isNegative
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : 'font-semibold text-blue-600 dark:text-blue-400'
                  }
                >
                  {result.available}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">{result.total}</span>
              </div>
            );
          }
          return (
            <div className="truncate text-right" title={displayText}>
              <span className={isNegative ? 'text-red-600 dark:text-red-400 font-medium' : undefined}>
                {result.text}
              </span>
            </div>
          );
        },
        meta: { align: 'right' },
        size: 90,
      },
      {
        accessorKey: 'availableWeight',
        header: '중량',
        cell: ({ row }) => {
          // DB 저장 단위: 톤(MT) → 표시: kg (× 1000, 입고 확정과 동일)
          const toKg = (v: number | null | undefined) => (v != null ? v * 1000 : null);
          const availableKg = toKg(row.original.availableWeight);
          const result = formatQuantity(
            availableKg,
            toKg(row.original.weight),
            toKg(row.original.soldWeight),
            3, // 중량 소수점 3자리
          );
          const isNegative = result.hasSales && availableKg != null && availableKg < 0;
          const kg = (v: string) => (v === '-' ? v : `${v} kg`);
          const displayText = result.hasSales ? `${kg(result.available!)} / ${kg(result.total!)}` : kg(result.text);
          if (result.hasSales) {
            return (
              <div className="flex items-center gap-1 truncate justify-end" title={displayText}>
                <span
                  className={
                    isNegative
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : 'font-semibold text-blue-600 dark:text-blue-400'
                  }
                >
                  {kg(result.available!)}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">{kg(result.total!)}</span>
              </div>
            );
          }
          return (
            <div className="truncate text-right" title={displayText}>
              <span className={isNegative ? 'text-red-600 dark:text-red-400 font-medium' : undefined}>
                {kg(result.text)}
              </span>
            </div>
          );
        },
        meta: { align: 'right' },
        size: 90,
      },
      {
        accessorKey: 'destinationName',
        header: '목적지',
        cell: ({ row }) => {
          const value = row.getValue('destinationName') as string | null;
          const label = resolveDestinationLabel(value);
          return <div className="truncate" title={label || undefined}>{label || '-'}</div>;
        },
        size: 90,
      },
      {
        accessorKey: 'etaDate',
        header: 'ETA',
        cell: ({ row }) => {
          const value = row.getValue('etaDate') as string | null;
          return <div className="truncate" title={value || undefined}>{value || '-'}</div>;
        },
        size: 100,
      },
      {
        id: 'excludeAction',
        header: '액션',
        cell: ({ row }) => {
          const container = row.original;
          const isExcluded = container.excludeFromInventory === true;
          const loading = excludeActionLoading === container.id;
          return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {isExcluded ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={loading}
                  onClick={() => handleExcludeFromInventory(container.id, false)}
                >
                  {loading ? '처리 중...' : (
                    <>
                      <Eye className="mr-1 h-3 w-3" />
                      제외 해제
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  disabled={loading}
                  onClick={() => handleExcludeFromInventory(container.id, true)}
                >
                  {loading ? '처리 중...' : (
                    <>
                      <EyeOff className="mr-1 h-3 w-3" />
                      제외
                    </>
                  )}
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [resolveSalesGradeLabel, resolvePackingLabel, resolveDestinationLabel, resolveWarehouseLabel, formatQuantity, excludeActionLoading, handleExcludeFromInventory],
  );

  if (loading) {
    return (
      <AppLayout user={user}>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-3 min-w-0 max-w-full">
        {/* 헤더 영역 */}
        <div className="flex items-center justify-between flex-shrink-0 min-w-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">입고예정재고</h1>
            <p className="text-sm text-muted-foreground mt-1">
              입고 예정 상태의 컨테이너별 재고를 확인하고 관리할 수 있습니다.
            </p>
          </div>
        </div>

        <DataTable
            isLoading={isContainersLoading}
            columns={columns}
            data={paginatedContainers}
            visibleColumns={columnSettings.visibleColumns}
            onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
            columnSizing={columnSettings.columnSizing}
            onColumnSizingChange={columnSettings.onColumnSizingChange}
            columnOrder={columnSettings.columnOrder}
            onColumnOrderChange={columnSettings.onColumnOrderChange}
            columnSettingsIconOnly={true}
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            manualPagination={true}
            enableSorting={true}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            rowClassName="h-10"
            onRowClick={(row) => {
              setSelectedContainerId(row.id);
              setDetailDrawerOpen(true);
            }}
            filterControls={
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="searchFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                    검색
                  </Label>
                  <Input
                    id="searchFilter"
                    value={search}
                    placeholder="B/K, B/L, 컨테이너번호, 상품명 검색"
                    className="w-64"
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                        <Filter className="mr-2 h-4 w-4" />
                        {availableProductCodes.length === 0
                          ? '전체'
                          : allProductsSelected
                            ? '전체'
                            : selectedProducts.size === 0
                              ? '선택 안됨'
                              : `${selectedProducts.size}개 선택됨`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id={`${inventoryPendingProductFilterDomId}-all`}
                              checked={availableProductCodes.length === 0 || allProductsSelected}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  setSelectedProducts(new Set(availableProductCodes));
                                } else if (checked === false) {
                                  setSelectedProducts(new Set());
                                }
                                setPage(1);
                              }}
                            />
                            <Label htmlFor={`${inventoryPendingProductFilterDomId}-all`} className="text-sm font-medium cursor-pointer flex-1">
                              전체
                            </Label>
                          </div>
                          {availableProductCodes.map((code, index) => {
                            const label = productCodes.find((c) => c.value === code)?.name ?? code;
                            return (
                              <div key={code} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                                <Checkbox
                                  id={`${inventoryPendingProductFilterDomId}-row-${index}`}
                                  checked={selectedProducts.has(code)}
                                  onCheckedChange={(checked) => {
                                    const next = new Set(selectedProducts);
                                    if (checked === true) next.add(code);
                                    else if (checked === false) next.delete(code);
                                    setSelectedProducts(next);
                                    setPage(1);
                                  }}
                                />
                                <Label htmlFor={`${inventoryPendingProductFilterDomId}-row-${index}`} className="text-sm font-medium cursor-pointer flex-1">
                                  {label}
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
                      <Button variant="outline" size="sm" className="h-8 w-36 justify-start">
                        <Filter className="mr-2 h-4 w-4" />
                        {selectedWarehouseValues.size === warehouseFilterOptions.length
                          ? '전체'
                          : selectedWarehouseValues.size === 0
                            ? '선택 안됨'
                            : `${selectedWarehouseValues.size}개 선택됨`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-3 max-h-[28rem] overflow-y-auto" align="start">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <Checkbox
                            id="warehouse-filter-all"
                            checked={selectedWarehouseValues.size === warehouseFilterOptions.length}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedWarehouseValues(new Set(warehouseFilterOptions.map((o) => o.value)));
                              } else {
                                setSelectedWarehouseValues(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label htmlFor="warehouse-filter-all" className="text-sm font-medium cursor-pointer flex-1">전체</Label>
                        </div>
                        {warehouseFilterOptions.map((opt) => (
                          <div key={opt.value} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id={`warehouse-filter-${opt.value}`}
                              checked={selectedWarehouseValues.has(opt.value)}
                              onCheckedChange={(checked: boolean) => {
                                const next = new Set(selectedWarehouseValues);
                                if (checked) next.add(opt.value);
                                else next.delete(opt.value);
                                setSelectedWarehouseValues(next);
                                setPage(1);
                              }}
                            />
                            <Label htmlFor={`warehouse-filter-${opt.value}`} className="text-sm font-medium cursor-pointer flex-1 truncate">{opt.label}</Label>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">재고 상태</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                        <Filter className="mr-2 h-4 w-4" />
                        {selectedInventoryStatuses.size === inventoryStatusOptions.length
                          ? '전체'
                          : selectedInventoryStatuses.size === 0
                            ? '선택 안됨'
                            : `${selectedInventoryStatuses.size}개 선택됨`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="start">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id="inventory-status-filter-all"
                              checked={selectedInventoryStatuses.size === inventoryStatusOptions.length}
                              onCheckedChange={(checked: boolean) => {
                                if (checked) {
                                  setSelectedInventoryStatuses(new Set(inventoryStatusOptions.map((s) => s.value)));
                                } else {
                                  setSelectedInventoryStatuses(new Set());
                                }
                                setPage(1);
                              }}
                            />
                            <Label htmlFor="inventory-status-filter-all" className="text-sm font-medium cursor-pointer flex-1">전체</Label>
                          </div>
                          {inventoryStatusOptions.map((status) => (
                            <div key={status.value} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                              <Checkbox
                                id={`inventory-status-filter-${status.value}`}
                                checked={selectedInventoryStatuses.has(status.value)}
                                onCheckedChange={(checked: boolean) => {
                                  const newStatuses = new Set(selectedInventoryStatuses);
                                  if (checked) newStatuses.add(status.value);
                                  else newStatuses.delete(status.value);
                                  setSelectedInventoryStatuses(newStatuses);
                                  setPage(1);
                                }}
                              />
                              <Label htmlFor={`inventory-status-filter-${status.value}`} className="text-sm font-medium cursor-pointer flex-1">{status.label}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Checkbox
                    id="includeExcluded"
                    checked={includeExcluded}
                    onCheckedChange={(checked) => {
                      setIncludeExcluded(checked === true);
                      setPage(1);
                    }}
                  />
                  <Label htmlFor="includeExcluded" className="text-sm font-medium cursor-pointer whitespace-nowrap">
                    제외된 재고 포함
                  </Label>
                </div>
              </div>
            }
          />

        {/* 입고예정 재고 상세 Drawer */}
        <InventoryPendingDetailDrawer
          open={detailDrawerOpen}
          onOpenChange={(open) => {
            setDetailDrawerOpen(open);
            if (!open) setSelectedContainerId(null);
          }}
          containerId={selectedContainerId}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['trade-contracts', 'containers', 'pending'] })}
        />
      </div>
    </AppLayout>
  );
}

