'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { FileText, Eye, EyeOff, Filter } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { useColumnSettings } from '@/hooks/use-column-settings';
import { DateRangePicker } from '@/components/schedules/date-range-picker';
import { TradeOrder, useTradeOrders } from '@/lib/hooks/use-trade-orders';
import { getInboundOrderContainerStockColumns } from '@/lib/inbound-order-stock-metrics';
import { InboundScheduledDetailDrawer } from '@/components/inbound/inbound-scheduled-detail-drawer';
import { InboundPendingDataDetailDrawer } from '@/components/inbound/inbound-pending-data-detail-drawer';
import { InboundEditDrawer } from '@/components/inbound/inbound-edit-drawer';
import { InboundSalesGradeEditDrawer } from '@/components/inbound/inbound-sales-grade-edit-drawer';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import Cookies from 'js-cookie';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

function InboundScheduledPageContent() {
  const queryClient = useQueryClient();
  const columnSettings = useColumnSettings('inbound-scheduled');
  const [user, setUser] = React.useState<User | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false);
  const [selectedTradeOrderId, setSelectedTradeOrderId] = React.useState<string | null>(null);
  const [inboundEditDrawerOpen, setInboundEditDrawerOpen] = React.useState(false);
  const [selectedTradeOrderForInbound, setSelectedTradeOrderForInbound] = React.useState<TradeOrder | null>(null);
  const [salesGradeEditDrawerOpen, setSalesGradeEditDrawerOpen] = React.useState(false);
  const [selectedTradeOrderIdForGradeEdit, setSelectedTradeOrderIdForGradeEdit] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [selectedProducts, setSelectedProducts] = React.useState<Set<string>>(new Set());
  const productDefaultAppliedRef = React.useRef(false);
  const [etaStartDate, setEtaStartDate] = React.useState<Date | undefined>(undefined);
  const [etaEndDate, setEtaEndDate] = React.useState<Date | undefined>(undefined);
  const [searchFilter, setSearchFilter] = React.useState('');
  const [includeExcluded, setIncludeExcluded] = React.useState(false);
  const [excludeActionOrderId, setExcludeActionOrderId] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<string>('etaDate');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [selectedWarehouseValues, setSelectedWarehouseValues] = React.useState<Set<string>>(new Set());
  const lastWarehouseOptionsLength = React.useRef(0);
  const isMobile = useIsMobile();

  // 코드 마스터 조회
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: tradeGradeCodes = [] } = useCodesByCategory('TRADE_GRADE');
  const { data: salesGradeCodes = [] } = useCodeMastersByGroup('SALES_GRADE');
  const { data: packingCodes = [] } = useCodesByCategory('PACKING_TYPE');
  const { data: currencyCodes = [] } = useCodesByCategory('CURRENCY');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: tradeStatusCodes = [] } = useCodeMastersByGroup('TRADE_ORDER_STATUS');

  // 창고 필터 옵션 (tb_warehouse 기준: 미지정 + 창고명)
  const warehouseFilterOptions = React.useMemo(() => {
    const list: Array<{ value: string; label: string }> = [{ value: '__none__', label: '미지정' }];
    warehouses.forEach((w) => {
      if (w.name?.trim()) list.push({ value: w.name.trim(), label: w.name.trim() });
    });
    return list;
  }, [warehouses]);

  // 창고 필터 기본값: 옵션 개수만 의존해 setState 루프 방지 (배열 참조 변경 시 재실행 방지)
  const warehouseOptionsLength = warehouseFilterOptions.length;
  React.useEffect(() => {
    const len = warehouseOptionsLength;
    if (len === 0) return;
    const prevLen = lastWarehouseOptionsLength.current;
    lastWarehouseOptionsLength.current = len;
    setSelectedWarehouseValues((prev) => {
      const isFirstLoad = prev.size === 0;
      const wasAllSelected = prev.size === prevLen;
      if (isFirstLoad || wasAllSelected) {
        const values = ['__none__'];
        warehouses.forEach((w) => {
          if (w.name?.trim()) values.push(w.name.trim());
        });
        return new Set(values);
      }
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- warehouses는 옵션 길이와 동기화됨, length만 의존해 루프 방지
  }, [warehouseOptionsLength]);

  // 코드명 조회 함수
  const getCodeName = React.useCallback((category: string, value?: string | null) => {
    if (!value) return null;
    const codes =
      category === 'PRODUCT'
        ? productCodes
        : category === 'TRADE_GRADE'
          ? tradeGradeCodes
          : category === 'PACKING_TYPE'
            ? packingCodes
            : category === 'CURRENCY'
              ? currencyCodes
              : [];
    const code = codes.find((c) => c.value === value);
    return code?.name || value;
  }, [productCodes, tradeGradeCodes, packingCodes, currencyCodes]);

  // 무역 상태 이름 가져오기 헬퍼 함수
  const getTradeStatusName = (value?: string | null) => {
    if (!value) return null;
    const code = tradeStatusCodes.find(
      (c) => c.value && c.value.trim().toUpperCase() === value.trim().toUpperCase()
    );
    return code?.name || value;
  };

  const getStatusBadgeStyle = (status?: string | null) => {
    if (!status) return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
    
    const normalizedStatus = status.trim().toUpperCase();
    if (normalizedStatus === 'BOOKING') {
      return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
    }
    if (normalizedStatus === 'DOCUMENTS') {
      return 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300';
    }
    if (normalizedStatus === 'DO') {
      return 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300';
    }
    if (normalizedStatus === 'CUSTOMS') {
      return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
    }
    if (normalizedStatus === 'ARRIVED') {
      return 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300';
    }
    if (normalizedStatus === 'QUARANTINE') {
      return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
    }
    if (normalizedStatus === 'COMPLETED') {
      return 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300';
    }
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  };

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // 상세 drawer와 형제인 영업등급·입고예정 편집 drawer: Esc 시 상세 핸들러보다 먼저 닫기
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (salesGradeEditDrawerOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSalesGradeEditDrawerOpen(false);
        return;
      }
      if (inboundEditDrawerOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setInboundEditDrawerOpen(false);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [salesGradeEditDrawerOpen, inboundEditDrawerOpen]);

  // 제품 옵션용: 상품 필터 없이 입고예정 부킹 목록
  const { data: allTradeOrdersForProducts = [] } = useTradeOrders({
    bookingOnly: true,
    salesStatus: 'INBOUND_SCHEDULED',
  });

  const availableProductCodes = React.useMemo(() => {
    const codeSet = new Set<string>();
    allTradeOrdersForProducts.forEach((order) => {
      const code = order.productCode ?? order.containers?.[0]?.product;
      if (code && code.trim() !== '') {
        codeSet.add(code.trim());
      }
    });
    return Array.from(codeSet).sort();
  }, [allTradeOrdersForProducts]);

  // 상품 필터: 전체 선택이면 미전달, 기본값 적용 전 빈 Set이면 미전달, 0개 선택이면 빈 배열
  const productsParam = React.useMemo(() => {
    if (availableProductCodes.length === 0 || selectedProducts.size === availableProductCodes.length) {
      return undefined;
    }
    if (selectedProducts.size === 0) {
      return productDefaultAppliedRef.current ? [] : undefined;
    }
    return Array.from(selectedProducts);
  }, [availableProductCodes.length, selectedProducts, availableProductCodes]);

  // 입고 예정 상태인 주문 가져오기 (salesStatus: 'INBOUND_SCHEDULED')
  const { data: tradeOrders = [], isLoading, refetch } = useTradeOrders({
    bookingOnly: true,
    salesStatus: 'INBOUND_SCHEDULED',
    productNames: productsParam,
    search: searchFilter.trim() !== '' ? searchFilter.trim() : undefined,
    includeOrdersWithAllContainersExcluded: includeExcluded,
  });

  React.useEffect(() => {
    if (availableProductCodes.length > 0 && !productDefaultAppliedRef.current) {
      productDefaultAppliedRef.current = true;
      setSelectedProducts(new Set(availableProductCodes));
    }
  }, [availableProductCodes]);

  // ETA 기간 + 창고 필터링 (반납여부와 동일: 전체 선택 시 필터 미적용, 0개 선택 시 없음, 일부 선택 시 해당만)
  const filteredOrders = React.useMemo(() => {
    let filtered = tradeOrders;

    // 창고 다중 선택 필터 (tb_warehouse 기준, ti_warehouse에는 창고명 저장)
    if (selectedWarehouseValues.size < warehouseFilterOptions.length) {
      if (selectedWarehouseValues.size === 0) {
        return [];
      }
      filtered = filtered.filter((order) => {
        const wh = order.pendingInbound?.warehouse ?? null;
        const raw = wh == null || wh === '' ? '__none__' : wh.trim();
        return selectedWarehouseValues.has(raw);
      });
    }

    // ETA 기간 필터링
    if (etaStartDate || etaEndDate) {
      filtered = filtered.filter((order) => {
        const etaDate = order.etaDate;
        if (!etaDate) return false;

        const orderEtaDate = new Date(etaDate);
        if (Number.isNaN(orderEtaDate.getTime())) return false;

        const orderDateOnly = new Date(orderEtaDate);
        orderDateOnly.setHours(0, 0, 0, 0);

        if (etaStartDate) {
          const startDate = new Date(etaStartDate);
          startDate.setHours(0, 0, 0, 0);
          if (orderDateOnly < startDate) return false;
        }

        if (etaEndDate) {
          const endDate = new Date(etaEndDate);
          endDate.setHours(23, 59, 59, 999);
          if (orderDateOnly > endDate) return false;
        }

        return true;
      });
    }

    return filtered;
  }, [tradeOrders, etaStartDate, etaEndDate, selectedWarehouseValues, warehouseFilterOptions.length]);

  const getSortValue = React.useCallback((order: TradeOrder, key: string): string | number | null => {
    const stock = getInboundOrderContainerStockColumns(order);
    if (key === 'containerCount') return stock.containerCount;
    if (key === 'stockSoldContainerEquiv') return stock.soldContainerEquiv;
    if (key === 'stockReservedContainerEquiv') return stock.reservedContainerEquiv;
    if (key === 'stockAvailableContainerEquiv') return stock.availableContainerEquiv;
    if (key === 'gradeCode') return (order.gradeCode ?? order.containers?.[0]?.tradeGrade ?? '') as string;
    if (key === 'salesGrade') return (order.containers?.[0]?.salesGrade ?? '') as string;
    if (key === 'destinationName') return (order.destinationName ?? order.finalDestinationName ?? '') as string;
    if (key === 'tradeStatus') return (order.tradeStatus ?? order.status ?? '') as string;
    if (key === 'igodate') return (order.pendingInbound?.igodate ?? '') as string;
    if (key === 'quarantineDate') return (order.pendingInbound?.quarantineDate ?? '') as string;
    if (key === 'dtDate') return (order.pendingInbound?.dtDate ?? '') as string;
    if (key === 'comparisonExchangeRate') return order.pendingInbound?.comparisonExchangeRate ?? 0;
    if (key === 'comparisonPurchaseCost') {
      const pi = order.pendingInbound;
      if (pi?.comparisonPurchaseCost != null && Number.isFinite(Number(pi.comparisonPurchaseCost))) {
        return Number(pi.comparisonPurchaseCost);
      }
      return 0;
    }
    const v = (order as unknown as Record<string, unknown>)[key];
    if (v == null) return '';
    return v as string | number;
  }, []);

  const handleSortChange = React.useCallback((col: string, order: 'asc' | 'desc') => {
    setSortBy(col);
    setSortOrder(order);
    setPage(1);
  }, []);

  const sortedOrders = React.useMemo(() => {
    const arr = [...filteredOrders];
    const isDate = ['etaDate', 'igodate', 'quarantineDate', 'dtDate', 'orderDate', 'createdAt', 'updatedAt'].includes(sortBy);
    const isNum = [
      'containerCount',
      'stockSoldContainerEquiv',
      'stockReservedContainerEquiv',
      'stockAvailableContainerEquiv',
      'unitPrice',
      'comparisonExchangeRate',
      'comparisonPurchaseCost',
    ].includes(sortBy);
    arr.sort((a, b) => {
      const aVal = getSortValue(a, sortBy);
      const bVal = getSortValue(b, sortBy);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null || aVal === '') return 1;
      if (bVal == null || bVal === '') return -1;
      let cmp = 0;
      if (isNum || (typeof aVal === 'number' && typeof bVal === 'number')) {
        cmp = Number(aVal) - Number(bVal);
      } else if (isDate || (typeof aVal === 'string' && typeof bVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(aVal)))) {
        cmp = new Date(String(aVal)).getTime() - new Date(String(bVal)).getTime();
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredOrders, sortBy, sortOrder, getSortValue]);

  const getProductDisplayName = React.useCallback(
    (code: string) => productCodes.find((c) => c.value === code)?.name ?? code,
    [productCodes],
  );

  const handleRowClick = React.useCallback((order: TradeOrder) => {
    setSelectedTradeOrderId(order.id);
    setDetailDrawerOpen(true);
  }, []);

  const handleExcludeOrderFromList = React.useCallback(
    async (order: TradeOrder, exclude: boolean) => {
      const containers = order.containers?.filter((c) => c?.id) ?? [];
      if (containers.length === 0) {
        toast({ title: '알림', description: '컨테이너가 없어 처리할 수 없습니다.', variant: 'destructive' });
        return;
      }
      setExcludeActionOrderId(order.id);
      try {
        for (const c of containers) {
          if (c.id) {
            await api.patch(`/trade/contracts/containers/${c.id}`, { excludeFromInventory: exclude });
          }
        }
        toast({
          title: exclude ? '목록에서 제외되었습니다.' : '제외가 해제되었습니다.',
          description: exclude ? '이 BL의 모든 컨테이너가 재고/입고 목록에서 제외됩니다.' : undefined,
        });
        await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
        void refetch();
      } catch (err: unknown) {
        const message = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
        toast({
          title: '처리 실패',
          description: message || (exclude ? '목록 제외에 실패했습니다.' : '제외 해제에 실패했습니다.'),
          variant: 'destructive',
        });
      } finally {
        setExcludeActionOrderId(null);
      }
    },
    [queryClient, refetch, toast],
  );

  const columns: ColumnDef<TradeOrder>[] = React.useMemo(() => [
    {
      accessorKey: 'tradeStatus',
      header: '상태',
      cell: ({ row }) => {
        const tradeStatus = row.original.tradeStatus || row.original.status || 'BOOKING';
        const statusName = row.original.tradeStatusName || getTradeStatusName(tradeStatus) || tradeStatus;
        return (
          <Badge
            variant="outline"
            className={cn('text-xs', getStatusBadgeStyle(tradeStatus), row.original.shipBack && 'line-through')}
          >
            {statusName}
          </Badge>
        );
      },
      size: 100,
    },
    {
      accessorKey: 'exporterName',
      header: '수출사',
      cell: ({ row }) => <div className="text-sm">{row.original.exporterName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'exportCountryName',
      header: '수출국',
      cell: ({ row }) => <div className="text-sm">{row.original.exportCountryName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'productName',
      header: '상품명',
      cell: ({ row }) => <div className="text-sm">{row.original.productName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'bl',
      header: 'BL',
      cell: ({ row }) => <div className="text-sm">{row.original.bl || '-'}</div>,
      size: 160,
    },
    {
      accessorKey: 'bk',
      header: 'BK',
      cell: ({ row }) => <div className="text-sm">{row.original.bk || '-'}</div>,
      size: 160,
    },
    {
      accessorKey: 'containerCount',
      header: () => (
        <span className="whitespace-nowrap" title="재고에 포함되는 컨테이너 대수">
          컨 수
        </span>
      ),
      cell: ({ row }) => {
        const n = getInboundOrderContainerStockColumns(row.original).containerCount;
        if (n <= 0) {
          return <div className="text-right text-sm text-muted-foreground">-</div>;
        }
        return (
          <div className="truncate text-right text-sm font-semibold tabular-nums" title={`${n}컨`}>
            {n}
          </div>
        );
      },
      meta: { align: 'right', headerLabel: '컨 수' },
      size: 72,
    },
    {
      accessorKey: 'stockSoldContainerEquiv',
      header: () => (
        <span
          className="whitespace-nowrap"
          title="영업 판매항목: 예약·판매중(RESERVED 등) + 완료(COMPLETED) 베일·중량의 컨 상당. 판매관리(tb)·시트 예약은 예약 열입니다."
        >
          판매
        </span>
      ),
      cell: ({ row }) => {
        const v = getInboundOrderContainerStockColumns(row.original).soldContainerEquiv;
        const text =
          v > 0.0001
            ? v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
            : '';
        return (
          <div className="text-right text-sm tabular-nums text-muted-foreground" title="컨 상당">
            {text || '-'}
          </div>
        );
      },
      meta: { align: 'right', headerLabel: '판매' },
      size: 72,
    },
    {
      accessorKey: 'stockReservedContainerEquiv',
      header: () => (
        <span
          className="whitespace-nowrap"
          title="판매관리(tb) BL 예약 + 판매예약 시트(예약등록) 컨 단위 합. 영업 판매항목 예약은 판매 열에 포함됩니다."
        >
          예약
        </span>
      ),
      cell: ({ row }) => {
        const v = getInboundOrderContainerStockColumns(row.original).reservedContainerEquiv;
        const text =
          v > 0.0001
            ? v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
            : '';
        return (
          <div className="text-right text-sm tabular-nums text-muted-foreground" title="컨 상당">
            {text || '-'}
          </div>
        );
      },
      meta: { align: 'right', headerLabel: '예약' },
      size: 72,
    },
    {
      accessorKey: 'stockAvailableContainerEquiv',
      header: () => (
        <span
          className="whitespace-nowrap"
          title="컨별 가용 베일(또는 중량)을 컨당 분모로 환산한 합계. 입고확정재고 API 가용과 동일 계열입니다."
        >
          가용재고
        </span>
      ),
      cell: ({ row }) => {
        const v = getInboundOrderContainerStockColumns(row.original).availableContainerEquiv;
        const isNeg = v < -0.0001;
        const text = v.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        return (
          <div
            className={cn(
              'text-right text-sm tabular-nums font-medium',
              isNeg && 'text-red-600 dark:text-red-400',
            )}
            title="컨별 가용 베일·중량 환산 합 (컨 상당)"
          >
            {text}
          </div>
        );
      },
      meta: { align: 'right', headerLabel: '가용재고' },
      size: 80,
    },
    {
      accessorKey: 'gradeCode',
      header: '등급(무역)',
      cell: ({ row }) => {
        const gradeCode = row.original.gradeCode ?? row.original.containers?.[0]?.tradeGrade ?? null;
        const name = getCodeName('TRADE_GRADE', gradeCode) || gradeCode;
        return <div className="text-sm">{name || '-'}</div>;
      },
      size: 130,
    },
    {
      accessorKey: 'salesGrade',
      header: '등급(영업)',
      cell: ({ row }) => {
        const salesGrade = row.original.containers?.[0]?.salesGrade ?? null;
        const name = salesGradeCodes.find((c) => c.value === salesGrade)?.name || salesGrade;
        return <div className="text-sm">{name || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'packingType',
      header: '패킹',
      cell: ({ row }) => {
        const order = row.original;
        const containers = order.containers ?? [];
        const packingCodes = containers.length > 0
          ? containers.map((c) => c.packingType ?? order.packingType).filter(Boolean)
          : [order.packingType].filter(Boolean);
        const names = [...new Set(packingCodes.map((code) => getCodeName('PACKING_TYPE', code) || code))];
        const text = names.length > 0 ? names.join(', ') : '-';
        return <div className="text-sm">{text}</div>;
      },
      size: 140,
    },
    {
      accessorKey: 'unitPrice',
      header: '단가',
      cell: ({ row }) => {
        const order = row.original;
        const containers = order.containers ?? [];
        const seen = new Set<string>();
        const parts: string[] = [];
        if (containers.length > 0) {
          containers.forEach((c) => {
            const currency = c.currency ?? order.currencyCode;
            const unitPrice = c.unitPrice ?? order.unitPrice;
            if (unitPrice != null) {
              const currencyName = getCodeName('CURRENCY', currency) || currency || '';
              const price = Number(unitPrice);
              const formatted = price % 1 === 0
                ? price.toLocaleString('ko-KR')
                : price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const key = currencyName ? `${currencyName} ${formatted}` : formatted;
              if (!seen.has(key)) {
                seen.add(key);
                parts.push(key);
              }
            }
          });
        } else {
          const unitPrice = order.unitPrice;
          if (unitPrice != null) {
            const currencyName = getCodeName('CURRENCY', order.currencyCode) || order.currencyCode || '';
            const price = Number(unitPrice);
            const formatted = price % 1 === 0
              ? price.toLocaleString('ko-KR')
              : price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            parts.push(currencyName ? `${currencyName} ${formatted}` : formatted);
          }
        }
        const text = parts.length > 0 ? parts.join(', ') : '-';
        return <div className="text-sm">{text}</div>;
      },
      size: 180,
    },
    {
      accessorKey: 'destinationName',
      header: '도착지',
      cell: ({ row }) => <div className="text-sm">{row.original.destinationName || row.original.finalDestinationName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'warehouse',
      header: '창고',
      cell: ({ row }) => {
        const wh = row.original.pendingInbound?.warehouse;
        const name = wh
          ? warehouses.find((w) => w.name === wh || w.id.toString() === wh)?.name ?? wh
          : null;
        return <div className="text-sm">{name || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'etaDate',
      header: 'ETA',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.etaDate)}</div>,
      size: 120,
    },
    {
      accessorKey: 'igodate',
      header: '이고',
      cell: ({ row }) => {
        const igodate = row.original.pendingInbound?.igodate;
        return <div className="text-sm">{formatDate(igodate)}</div>;
      },
      size: 110,
    },
    {
      accessorKey: 'quarantineDate',
      header: '검역',
      cell: ({ row }) => {
        const quarantineDate = row.original.pendingInbound?.quarantineDate;
        return <div className="text-sm">{formatDate(quarantineDate)}</div>;
      },
      size: 110,
    },
    {
      accessorKey: 'dtDate',
      header: 'DT',
      cell: ({ row }) => {
        const dtDate = row.original.pendingInbound?.dtDate;
        return <div className="text-sm">{formatDate(dtDate)}</div>;
      },
      size: 110,
    },
    {
      accessorKey: 'comparisonExchangeRate',
      header: '예정 환율',
      cell: ({ row }) => {
        const v = row.original.pendingInbound?.comparisonExchangeRate;
        if (v == null) return <div className="text-sm text-center">-</div>;
        const formatted = parseFloat(Number(v).toFixed(6)).toString();
        return <div className="text-sm text-center">{formatted}</div>;
      },
      size: 120,
    },
    {
      accessorKey: 'comparisonPurchaseCost',
      header: '예정 원가',
      cell: ({ row }) => {
        const order = row.original;
        const inboundData = order.pendingInbound;
        if (!inboundData) return <div className="text-sm text-center">-</div>;
        const stored = inboundData.comparisonPurchaseCost != null ? Number(inboundData.comparisonPurchaseCost) : null;
        if (stored != null && Number.isFinite(stored)) {
          return (
            <div className="text-sm text-center font-semibold">
              {stored.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
            </div>
          );
        }
        const comparisonRate = inboundData.comparisonExchangeRate ?? 0;
        const unitPriceValue = order.containers?.[0]?.unitPrice ?? order.unitPrice ?? 0;
        const qty = order.containers?.length ?? 0;
        const firstPart = (comparisonRate * Number(unitPriceValue)) / 1000;
        const totalWeight = order.containers?.reduce((sum, c) => sum + (c.weight != null ? Number(c.weight) : 0), 0) ?? 0;
        const customsFee = inboundData.customsFee ?? 0;
        const firstTierLoadingFee = inboundData.firstTierLoadingFee ?? 0;
        const doCost = inboundData.doCost ?? 0;
        const quarantineAgencyFee = inboundData.quarantineAgencyFee ?? 0;
        const customsDuty = inboundData.customsDuty ?? 0;
        const additionalItem = inboundData.additionalItem ?? 0;
        const bankFee = inboundData.bankFee ?? 0;
        const quarantineWorkCost = inboundData.quarantineWorkCost ?? 0;
        const spot = inboundData.spot ?? 0;
        const document = inboundData.document ?? 0;
        const igobi = (inboundData.igobi ?? 0) * qty;
        const extractionFee = inboundData.extractionFee ?? 0;
        const sto = inboundData.sto ?? 0;
        const fumigationQuarantine = inboundData.fumigationQuarantine ?? 0;
        const fee = inboundData.fee ?? 0;
        const sampleCollection = inboundData.sampleCollection ?? 0;
        const sum = customsFee + firstTierLoadingFee + doCost + quarantineAgencyFee + customsDuty + additionalItem + bankFee + quarantineWorkCost + spot + document + igobi + extractionFee + sto + fumigationQuarantine + fee + sampleCollection;
        const secondPart = totalWeight > 0 ? sum / totalWeight / 1000 : 0;
        const quotaCost = inboundData.quotaCost ?? 0;
        const targetMargin = inboundData.targetMargin ?? 0;
        const comparisonPurchaseCost = firstPart + secondPart + quotaCost + targetMargin;
        if (comparisonPurchaseCost === 0) return <div className="text-sm text-center">-</div>;
        return (
          <div className="text-sm text-center font-semibold">
            {comparisonPurchaseCost.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
          </div>
        );
      },
      size: 140,
    },
    {
      accessorKey: 'notes',
      header: '비고',
      cell: ({ row }) => {
        const salesNotes = row.original.salesNotes?.trim();
        const tradeNotes = row.original.notes?.trim();
        if (!salesNotes && !tradeNotes) return <div className="text-sm text-muted-foreground">-</div>;
        const fullTitle = [
          tradeNotes ? `무역비고: ${tradeNotes}` : null,
          salesNotes ? `영업비고: ${salesNotes}` : null,
        ].filter(Boolean).join('\n');
        return (
          <div className="text-sm max-w-[180px] space-y-1" title={fullTitle}>
            {tradeNotes && (
              <div className="truncate" title={tradeNotes}>무역비고: {tradeNotes}</div>
            )}
            {salesNotes && (
              <div className="truncate" title={salesNotes}>영업비고: {salesNotes}</div>
            )}
          </div>
        );
      },
      size: 180,
    },
    {
      id: 'excludeAction',
      header: '액션',
      enableSorting: false,
      cell: ({ row }) => {
        const order = row.original;
        const containers = order.containers ?? [];
        const allExcluded = containers.length > 0 && containers.every((c) => c.excludeFromInventory === true);
        const loading = excludeActionOrderId === order.id;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {allExcluded ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={loading}
                onClick={() => handleExcludeOrderFromList(order, false)}
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
                disabled={loading || containers.length === 0}
                onClick={() => handleExcludeOrderFromList(order, true)}
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
      size: 140,
    },
  ], [getCodeName, salesGradeCodes, tradeStatusCodes, warehouses, excludeActionOrderId, handleExcludeOrderFromList]);

  const destinationCodes = useCodesByCategory('DESTINATION_PORT');
  const resolveDestinationLabel = React.useCallback(
    (code?: string | null) => {
      if (!code) return '-';
      const destination = destinationCodes.data?.find(
        (c) => c.value === code || c.name === code
      );
      return destination?.name || code;
    },
    [destinationCodes.data]
  );

  const paginatedOrders = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return sortedOrders.slice(start, end);
  }, [sortedOrders, page, pageSize]);

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">입고 예정</h1>
            <p className="hidden text-muted-foreground md:block">
              입고 예정 데이터가 입력된 주문(BL) 정보를 조회합니다.
            </p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={paginatedOrders}
          visibleColumns={columnSettings.visibleColumns}
          onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
          columnSizing={columnSettings.columnSizing}
          onColumnSizingChange={columnSettings.onColumnSizingChange}
          columnOrder={columnSettings.columnOrder}
          onColumnOrderChange={columnSettings.onColumnOrderChange}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={sortedOrders.length}
          totalPages={Math.max(1, Math.ceil(sortedOrders.length / pageSize))}
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
          getRowClassName={(row) =>
            row.shipBack === true ? 'line-through text-muted-foreground' : undefined
          }
          excludeRowDecorationColumnIds={['excludeAction']}
          filterControls={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="searchFilter" className="whitespace-nowrap text-sm font-medium text-muted-foreground">검색</Label>
                <Input
                  id="searchFilter"
                  value={searchFilter}
                  placeholder="B/K, B/L, 상품명 검색"
                  className="w-64"
                  onChange={(e) => {
                    setSearchFilter(e.target.value);
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
                        : selectedProducts.size === availableProductCodes.length
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
                            id="inbound-scheduled-product-filter-all"
                            checked={
                              availableProductCodes.length === 0 ||
                              selectedProducts.size === availableProductCodes.length
                            }
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedProducts(new Set(availableProductCodes));
                              } else {
                                setSelectedProducts(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label htmlFor="inbound-scheduled-product-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                            전체
                          </Label>
                        </div>
                        {availableProductCodes.map((code) => (
                          <div key={code} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id={`inbound-scheduled-product-filter-${code}`}
                              checked={selectedProducts.has(code)}
                              onCheckedChange={(checked: boolean) => {
                                const next = new Set(selectedProducts);
                                if (checked) next.add(code);
                                else next.delete(code);
                                setSelectedProducts(next);
                                setPage(1);
                              }}
                            />
                            <Label htmlFor={`inbound-scheduled-product-filter-${code}`} className="text-sm font-medium cursor-pointer flex-1">
                              {getProductDisplayName(code)}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">ETA 기간</Label>
                <DateRangePicker
                  startDate={etaStartDate}
                  endDate={etaEndDate}
                  onChange={(startDate, endDate) => {
                    setEtaStartDate(startDate);
                    setEtaEndDate(endDate);
                    setPage(1);
                  }}
                  className="w-64"
                />
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
                        <Label htmlFor="warehouse-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                          전체
                        </Label>
                      </div>
                      {warehouseFilterOptions.map((opt) => (
                        <div
                          key={opt.value}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                        >
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
                          <Label
                            htmlFor={`warehouse-filter-${opt.value}`}
                            className="text-sm font-medium cursor-pointer flex-1 truncate"
                          >
                            {opt.label}
                          </Label>
                        </div>
                      ))}
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
                <Label htmlFor="includeExcluded" className="text-sm font-medium cursor-pointer whitespace-nowrap">제외된 BL 포함</Label>
              </div>
            </div>
          }
        />

        {detailDrawerOpen && selectedTradeOrderId && (
          <InboundScheduledDetailDrawer
            open={detailDrawerOpen}
            onOpenChange={(open) => {
              setDetailDrawerOpen(open);
              if (!open) {
                setSelectedTradeOrderId(null);
              }
            }}
            bookingId={selectedTradeOrderId}
            onEditSalesGrade={(orderId) => {
              setSelectedTradeOrderIdForGradeEdit(orderId);
              setSalesGradeEditDrawerOpen(true);
            }}
            onEditInboundData={(order) => {
              setSelectedTradeOrderForInbound(order);
              setInboundEditDrawerOpen(true);
            }}
            onConfirmInbound={(order) => {
              setSelectedTradeOrderForInbound(order);
              // 입고 확정 drawer는 InboundScheduledDetailDrawer 내부에서 관리
            }}
            onSuccess={async () => {
              await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
              if (selectedTradeOrderId) {
                await queryClient.invalidateQueries({ queryKey: ['trade-order', selectedTradeOrderId] });
              }
              void refetch();
            }}
          />
        )}

        <InboundSalesGradeEditDrawer
          open={salesGradeEditDrawerOpen}
          onOpenChange={(open) => {
            setSalesGradeEditDrawerOpen(open);
            if (!open) {
              setSelectedTradeOrderIdForGradeEdit(null);
            }
          }}
          orderId={selectedTradeOrderIdForGradeEdit}
          onSuccess={async () => {
            // 데이터 갱신
            await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
            if (selectedTradeOrderId) {
              await queryClient.invalidateQueries({ queryKey: ['trade-order', selectedTradeOrderId] });
            }
            void refetch();
          }}
        />

        {inboundEditDrawerOpen && selectedTradeOrderForInbound && (
          <InboundEditDrawer
            open={inboundEditDrawerOpen}
            onOpenChange={(open) => {
              setInboundEditDrawerOpen(open);
              if (!open) {
                setSelectedTradeOrderForInbound(null);
              }
            }}
            tradeOrder={selectedTradeOrderForInbound}
            labelResolvers={{
              destination: resolveDestinationLabel,
            }}
            onSubmit={async (data) => {
              if (!selectedTradeOrderForInbound?.id) return;
              try {
                // 입고 데이터 저장
                await api.put(`/trade/contracts/orders/${selectedTradeOrderForInbound.id}/inbound`, {
                  ...data,
                  status: 'PENDING',
                });
                toast({
                  title: '성공',
                  description: '입고예정 정보가 저장되었습니다.',
                });
                setInboundEditDrawerOpen(false);
                setSelectedTradeOrderForInbound(null);
                // 상세정보 drawer는 유지하고 데이터만 갱신
                await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
                if (selectedTradeOrderId) {
                  await queryClient.invalidateQueries({ queryKey: ['trade-order', selectedTradeOrderId] });
                }
                void refetch();
              } catch (error) {
                console.error('입고예정 저장 중 오류:', error);
                toast({
                  title: '오류',
                  description: '입고예정 저장 중 오류가 발생했습니다.',
                  variant: 'destructive',
                });
              }
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function InboundScheduledPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InboundScheduledPageContent />
    </Suspense>
  );
}
