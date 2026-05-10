'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { FileText, Loader2, Plus, Filter } from 'lucide-react';
import { toastSuccess, toastApiError } from '@/lib/utils/toast-helpers';

import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { PurchaseManagementDataTable } from '@/components/trade/purchase-management-data-table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import {
  TradeContract,
  useTradeContracts,
  useDeleteTradeContract,
} from '@/lib/hooks/use-trade-contracts';
import { TradeOrder } from '@/lib/hooks/use-trade-orders';
import { TradeContractFormDrawer } from '@/components/trade-contract/trade-contract-form-drawer';
import { TradeContractDetailDrawer } from '@/components/trade-contract/trade-contract-detail-drawer';
import { TradeOrderFormDrawer } from '@/components/trade-order/trade-order-form-drawer';
import { TradeOrderDetailDrawer } from '@/components/trade-order/trade-order-detail-drawer';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import { useUsers } from '@/lib/hooks/use-users';
import { useIsMobile } from '@/hooks/use-mobile';
import Cookies from 'js-cookie';

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

// 쿠키에서 무역 권한 등록자 ID 읽기
const getInitialTradeManagerUserId = () => {
  if (typeof window === 'undefined') return '__all__';
  const saved = Cookies.get('trade-manager-user-id');
  return saved || '__all__';
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

// 통합 타입 정의
// 계약과 발주 모두 계약 테이블에서 가져오므로 TradeContract 기반
type PurchaseItem = TradeContract & { type: 'contract' | 'order' };

function PurchaseManagementPageContent() {
  const [user, setUser] = React.useState<User | null>(null);
  const [contractDrawerOpen, setContractDrawerOpen] = React.useState(false);
  const [orderDrawerOpen, setOrderDrawerOpen] = React.useState(false);
  const [contractDetailDrawerOpen, setContractDetailDrawerOpen] = React.useState(false);
  const [orderDetailDrawerOpen, setOrderDetailDrawerOpen] = React.useState(false);
  const [drawerMode, setDrawerMode] = React.useState<'create' | 'edit'>('edit');
  const [selectedTradeContract, setSelectedTradeContract] = React.useState<TradeContract | null>(null);
  const [selectedTradeOrder, setSelectedTradeOrder] = React.useState<TradeOrder | null>(null);
  const [selectedTradeContractId, setSelectedTradeContractId] = React.useState<string | null>(null);
  const [selectedTradeOrderId, setSelectedTradeOrderId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<PurchaseItem | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [selectedProducts, setSelectedProducts] = React.useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = React.useState<Set<string>>(new Set(['ORDER', '__contract__']));
  const [selectedManagerUserId, setSelectedManagerUserId] = React.useState<string>(getInitialTradeManagerUserId);
  const [contractNo, setContractNo] = React.useState<string>('');
  const [selectedExporters, setSelectedExporters] = React.useState<Set<string>>(new Set());
  const exporterDefaultAppliedRef = React.useRef(false);
  const productDefaultAppliedRef = React.useRef(false);
  const [sortBy, setSortBy] = React.useState<string>('createdAt');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  /** 상품명에 공백·특수문자가 있으면 `id=...${product}`가 깨져 Label이 다른 체크박스와 연결될 수 있음 */
  const tradeProductFilterDomId = React.useId();

  const deleteContractMutation = useDeleteTradeContract();
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: exporterCodes = [] } = useCodeMastersByGroup('EXPORTER');
  const isMobile = useIsMobile();

  // 등록자 목록 조회 (무역팀 권한이 있는 활성 사용자만)
  const { data: usersResponse } = useUsers({ status: 'active', limit: 1000 });
  const availableUsers = React.useMemo(() => {
    if (!usersResponse?.data) return [];
    // 무역팀 권한(ROLE_TRADE)이 있는 사용자만 필터링
    return usersResponse.data.filter((user) => {
      if (!user.roles || user.roles.length === 0) return false;
      return user.roles.some((role) => role.code === 'ROLE_TRADE');
    });
  }, [usersResponse]);

  // 쿠키에서 읽어온 등록자 ID가 유효한지 확인하고 초기화
  React.useEffect(() => {
    if (availableUsers.length > 0 && selectedManagerUserId !== '__all__') {
      const savedUserId = parseInt(selectedManagerUserId, 10);
      const isValidUser = availableUsers.some((user) => user.id === savedUserId);
      if (!isValidUser) {
        // 저장된 사용자가 더 이상 유효하지 않으면 전체로 초기화
        setSelectedManagerUserId('__all__');
        Cookies.set('trade-manager-user-id', '__all__', { expires: 365 });
      }
    }
  }, [availableUsers, selectedManagerUserId]);

  const searchParams = useSearchParams();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  // URL 쿼리 파라미터에서 계약번호 읽기
  React.useEffect(() => {
    const contractNoParam = searchParams.get('contractNo');
    if (contractNoParam) {
      setContractNo(contractNoParam);
      setPage(1);
    }
  }, [searchParams]);

  const statusOptions = [
    { value: 'ORDER', label: '발주' },
    { value: '__contract__', label: '계약' },
  ] as const;

  const selectedStatusArray = React.useMemo(() => {
    if (selectedStatuses.size === statusOptions.length) return undefined;
    if (selectedStatuses.size === 0) return [];
    return Array.from(selectedStatuses);
  }, [selectedStatuses]);

  // 필터 옵션용 제품/수출사 목록 조회 (필터 없이 모든 계약에서 추출)
  const { data: allContractsForProducts = [] } = useTradeContracts({});

  // 계약 목록에서 실제로 사용되는 제품 목록 추출 (필터 옵션용)
  const availableProducts = React.useMemo(() => {
    const productSet = new Set<string>();
    allContractsForProducts.forEach((contract) => {
      if (contract.productName) {
        productSet.add(contract.productName);
      }
    });
    return Array.from(productSet).sort();
  }, [allContractsForProducts]);

  /** 옵션 집합이 바뀔 때만 동기화·파라미터 재계산 (배열 참조만 바뀌는 경우 제외). 목록은 이미 정렬됨 */
  const availableProductsKey = React.useMemo(
    () => availableProducts.join('\u0001'),
    [availableProducts],
  );

  const selectedProductsKeySorted = React.useMemo(
    () => [...selectedProducts].sort((a, b) => a.localeCompare(b)).join('\u0001'),
    [selectedProducts],
  );

  const allProductsSelected = React.useMemo(
    () =>
      availableProducts.length > 0 &&
      selectedProducts.size === availableProducts.length &&
      selectedProductsKeySorted === availableProductsKey,
    [availableProducts.length, availableProductsKey, selectedProducts.size, selectedProductsKeySorted],
  );

  // 계약 목록에서 실제로 사용되는 수출사(코드) 목록 추출 (필터 옵션용)
  const availableExporters = React.useMemo(() => {
    const exporterSet = new Set<string>();
    allContractsForProducts.forEach((contract) => {
      const code = contract.exporter?.trim();
      if (code) exporterSet.add(code);
    });
    return Array.from(exporterSet).sort();
  }, [allContractsForProducts]);

  // 수출사 필터: 전체 선택이면 미전달(백엔드 필터 없음 → exporter null인 계약(예: 임시) 포함). 수출사 기본값 적용 전(selectedExporters 빈 상태)에도 미전달. 0개 선택 = 빈 배열 → 결과 없음
  const exportersParam = React.useMemo(() => {
    if (availableExporters.length === 0 || selectedExporters.size === availableExporters.length) return undefined;
    if (selectedExporters.size === 0) return exporterDefaultAppliedRef.current ? [] : undefined;
    return Array.from(selectedExporters);
  }, [availableExporters.length, selectedExporters, availableExporters]);

  // 상품 필터: 전체 선택이면 미전달, 0개 선택 = 빈 배열
  const productsParam = React.useMemo(() => {
    if (availableProducts.length === 0) return undefined;
    if (selectedProducts.size === 0) {
      return productDefaultAppliedRef.current ? [] : undefined;
    }
    if (allProductsSelected) return undefined;
    return Array.from(selectedProducts);
  }, [availableProducts.length, allProductsSelected, selectedProducts]);

  // 계약 목록 조회 (계약과 발주 모두 계약 테이블에서 가져옴)
  const createdById = selectedManagerUserId !== '__all__' ? parseInt(selectedManagerUserId, 10) : undefined;
  const { data: tradeContracts = [], isLoading: isLoadingContracts, refetch: refetchContracts } = useTradeContracts({
    contractStatus: selectedStatusArray,
    productNames: productsParam,
    contractNo: contractNo && contractNo.trim() !== '' ? contractNo : undefined,
    createdById: createdById && !isNaN(createdById) ? createdById : undefined,
    exporters: exportersParam,
  });

  // 수출사 필터 기본값: 전체 선택 (최초 1회만, availableExporters 로드 후)
  React.useEffect(() => {
    if (availableExporters.length > 0 && !exporterDefaultAppliedRef.current) {
      exporterDefaultAppliedRef.current = true;
      setSelectedExporters(new Set(availableExporters));
    }
  }, [availableExporters]);

  // 상품 필터 기본값: 전체 선택 (최초 1회만, 옵션 키가 생긴 뒤)
  React.useEffect(() => {
    if (availableProducts.length === 0 || !availableProductsKey) return;
    if (!productDefaultAppliedRef.current) {
      productDefaultAppliedRef.current = true;
      setSelectedProducts(new Set(availableProducts));
    }
  }, [availableProductsKey]);

  // 계약과 발주를 통합하여 하나의 배열로 만들기
  // 모두 계약 테이블에서 가져오므로, contractStatus로 구분
  // 필터링은 백엔드에서 처리되므로 여기서는 타입만 추가
  const combinedItems = React.useMemo(() => {
    const items = tradeContracts.map((contract) => {
      // ORDER 상태면 발주, 아니면 계약
      const type = contract.contractStatus === 'ORDER' ? 'order' as const : 'contract' as const;
      return { ...contract, type } as PurchaseItem;
    });

    return items;
  }, [tradeContracts]);

  // 상품은 백엔드 IN 필터와 동일 집합으로 한 번 더 맞춤(쿼리스트링/캐시 이슈 시에도 표시 일치)
  const filteredItems = React.useMemo(() => {
    if (productsParam === undefined) return combinedItems;
    if (productsParam.length === 0) return [];
    const allow = new Set(productsParam);
    return combinedItems.filter(
      (item) => item.productName != null && item.productName !== '' && allow.has(item.productName),
    );
  }, [combinedItems, productsParam]);

  // 정렬 처리
  const sortedItems = React.useMemo(() => {
    if (!sortBy) return filteredItems;
    
    const sorted = [...filteredItems].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      // 정렬할 필드 값 가져오기
      switch (sortBy) {
        case 'id':
          aValue = a.id;
          bValue = b.id;
          break;
        case 'orderDate':
          aValue = a.orderDate ? new Date(a.orderDate).getTime() : 0;
          bValue = b.orderDate ? new Date(b.orderDate).getTime() : 0;
          break;
        case 'contractNo':
          aValue = (a.contractNo || '').toLowerCase();
          bValue = (b.contractNo || '').toLowerCase();
          break;
        case 'exportCountryName':
          aValue = (a.exportCountryName || '').toLowerCase();
          bValue = (b.exportCountryName || '').toLowerCase();
          break;
        case 'exporterName':
          aValue = (a.exporterName || '').toLowerCase();
          bValue = (b.exporterName || '').toLowerCase();
          break;
        case 'shippingLineName':
          aValue = (a.shippingLineName || '').toLowerCase();
          bValue = (b.shippingLineName || '').toLowerCase();
          break;
        case 'productName':
          aValue = (a.productName || '').toLowerCase();
          bValue = (b.productName || '').toLowerCase();
          break;
        case 'unitPrice':
          aValue = a.unitPrice ?? 0;
          bValue = b.unitPrice ?? 0;
          break;
        case 'contractStatus':
          aValue = (a.contractStatus || '').toLowerCase();
          bValue = (b.contractStatus || '').toLowerCase();
          break;
        case 'createdBy':
          aValue = (a.createdBy?.name || '').toLowerCase();
          bValue = (b.createdBy?.name || '').toLowerCase();
          break;
        case 'createdAt':
          aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        default:
          return 0;
      }
      
      // 비교
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' 
          ? aValue.localeCompare(bValue, 'ko')
          : bValue.localeCompare(aValue, 'ko');
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
    
    return sorted;
  }, [filteredItems, sortBy, sortOrder]);

  const handleSortChange = React.useCallback((newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1); // 정렬 변경 시 첫 페이지로
  }, []);

  const isLoading = isLoadingContracts;

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString('ko-KR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const columns: ColumnDef<PurchaseItem>[] = React.useMemo(() => [
    {
      accessorKey: 'type',
      header: '상태',
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === 'order') {
          return (
            <Badge
              variant="outline"
              className="border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300"
            >
              발주
            </Badge>
          );
        } else {
          return (
            <Badge
              variant="outline"
              className="border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300"
            >
              계약
            </Badge>
          );
        }
      },
      size: 100,
    },
    {
      accessorKey: 'orderCount',
      header: '주문',
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === 'contract') {
          const orderCount = item.orderCount ?? 0;
          const totalCount = item.totalOrderCount;
          if (totalCount !== null && totalCount !== undefined) {
            return (
              <div className="text-sm text-center">
                {orderCount} / {totalCount}
              </div>
            );
          }
          return (
            <div className="text-sm text-center">
              {orderCount}
            </div>
          );
        }
        return <div className="text-sm text-center">-</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'orderStatusSummary',
      header: '물류 상태',
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        if (item.type !== 'contract') return <div className="text-sm text-muted-foreground">-</div>;
        const contract = item;
        const orderCount = contract.orderCount || 0;
        const summary = contract.orderStatusSummary;
        if (!summary || orderCount === 0) return <div className="text-sm text-muted-foreground">-</div>;

        const statusItems: Array<{ name: string; count: number }> = [];
        Object.entries(summary).forEach(([statusName, count]) => {
          if (count > 0) statusItems.push({ name: statusName, count });
        });
        if (statusItems.length === 0) return <div className="text-sm text-muted-foreground">상태 없음</div>;

        const getStatusBadgeStyle = (statusName: string) => {
          const n = statusName.trim();
          if (n.includes('부킹') || n === 'BOOKING') return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
          if (n.includes('서류') || n.includes('DOCUMENTS')) return 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300';
          if (n === 'DO' || n.includes('DO')) return 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300';
          if (n.includes('통관') || n === 'CUSTOMS') return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
          if (n.includes('도착') || n === 'ARRIVED') return 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300';
          if (n.includes('검역') || n === 'QUARANTINE') return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
          if (n.includes('완료') || n === 'COMPLETED') return 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300';
          return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
        };

        return (
          <div className="flex flex-wrap gap-1.5">
            {statusItems.map((s, i) => (
              <Badge key={i} variant="outline" className={`text-xs ${getStatusBadgeStyle(s.name)}`}>
                {s.name} {s.count > 1 && `(${s.count})`}
              </Badge>
            ))}
          </div>
        );
      },
      size: 200,
    },
    {
      accessorKey: 'orderDate',
      header: '발주일',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.orderDate)}</div>,
      size: 100,
    },
    {
      accessorKey: 'contractNo',
      header: '계약번호',
      cell: ({ row }) => {
        const item = row.original;
        const contractNo = item.type === 'contract' ? item.contractNo : item.contractNo;
        const fileId = item.type === 'contract' ? item.contractGoogleDriveFileId : item.contractGoogleDriveFileId;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm">{contractNo || '-'}</span>
            {fileId && (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        );
      },
      size: 140,
    },
    {
      accessorKey: 'exportCountryName',
      header: '수출국',
      cell: ({ row }) => <div className="text-sm">{row.original.exportCountryName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'exporterName',
      header: '수출사',
      cell: ({ row }) => <div className="text-sm">{row.original.exporterName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'shippingLineName',
      header: '선사',
      cell: ({ row }) => <div className="text-sm">{row.original.shippingLineName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'destinationName',
      header: '도착항',
      cell: ({ row }) => <div className="text-sm">{row.original.destinationName || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'productName',
      header: '상품',
      cell: ({ row }) => {
        const productCode = productCodes.find((code) => code.value === row.original.productName);
        return <div className="text-sm">{productCode ? productCode.name : row.original.productName || '-'}</div>;
      },
      size: 150,
    },
    {
      accessorKey: 'grade',
      header: '등급',
      cell: ({ row }) => {
        const item = row.original;
        const grade = item.type === 'contract' ? (item.gradeName || item.grade) : item.grade;
        return <div className="text-sm">{grade || '-'}</div>;
      },
      size: 100,
    },
    {
      accessorKey: 'packingType',
      header: '패킹 타입',
      cell: ({ row }) => {
        const item = row.original as TradeContract;
        return <div className="text-sm">{item.packingName || item.packingType || '-'}</div>;
      },
      size: 120,
    },
    {
      accessorKey: 'unitPrice',
      header: '단가',
      cell: ({ row }) => (
        <div className="text-sm text-right">
          {row.original.unitPrice != null ? formatNumber(row.original.unitPrice) : '-'}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: 'currencyName',
      header: '통화단위',
      cell: ({ row }) => <div className="text-sm">{row.original.currencyName || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'commissionDollar',
      header: '커미션 $',
      cell: ({ row }) => <div className="text-sm">{row.original.commissionDollar || '-'}</div>,
      size: 120,
    },
    {
      accessorKey: 'commissionMonth',
      header: '커미션 월',
      cell: ({ row }) => <div className="text-sm">{row.original.commissionMonth || '-'}</div>,
      size: 100,
    },
    {
      accessorKey: 'quota',
      header: '쿼터',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.quota === 'Y' ? '예' : row.original.quota === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'fumigation',
      header: '훈증',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.fumigation === 'Y' ? '예' : row.original.fumigation === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'customsDuty',
      header: '관세',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.customsDuty === 'Y' ? '예' : row.original.customsDuty === 'N' ? '아니오' : '-'}
        </div>
      ),
      size: 80,
    },
    {
      accessorKey: 'monthlyOrderPlan',
      header: '월별 계획',
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        if (item.type !== 'contract') return <div className="text-sm text-muted-foreground">-</div>;
        const contract = item;
        const totalOrderCount = contract.totalOrderCount;
        const monthlyOrderPlan = contract.monthlyOrderPlan;
        if (
          totalOrderCount == null ||
          totalOrderCount < 2 ||
          !monthlyOrderPlan ||
          Object.keys(monthlyOrderPlan).length === 0
        ) {
          return <div className="text-sm text-muted-foreground">-</div>;
        }

        const sortedEntries = Object.entries(monthlyOrderPlan).sort(([a], [b]) => a.localeCompare(b));
        const monthlyOrderActual = contract.monthlyOrderActual || {};
        const headerTexts = sortedEntries.map(([yearMonth], index) => {
          const [year, month] = yearMonth.split('-');
          const monthNum = parseInt(month, 10);
          const yearShort = year.slice(-2);
          if (index === 0) return `${yearShort}년 ${monthNum.toString().padStart(2, '0')}월`;
          const [prevYear] = sortedEntries[index - 1][0].split('-');
          return year === prevYear ? `${monthNum.toString().padStart(2, '0')}월` : `${yearShort}년 ${monthNum.toString().padStart(2, '0')}월`;
        });

        return (
          <div className="py-1">
            <div className="inline-block border border-border rounded overflow-hidden">
              <table className="text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    {sortedEntries.map(([yearMonth], index) => (
                      <th key={yearMonth} className="px-2 py-1 text-center border-r border-border last:border-r-0 font-medium text-muted-foreground">
                        {headerTexts[index]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {sortedEntries.map(([yearMonth, plannedCount]) => {
                      const actualCount = monthlyOrderActual[yearMonth] || 0;
                      const isShortage = actualCount < plannedCount;
                      return (
                        <td
                          key={yearMonth}
                          className={`px-2 py-1 text-center border-r border-border last:border-r-0 font-medium ${isShortage ? 'text-destructive' : ''}`}
                        >
                          {actualCount}/{plannedCount}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      },
      size: 280,
    },
    {
      accessorKey: 'notes',
      header: '비고',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm max-w-[200px] truncate" title={row.original.notes ?? undefined}>
          {row.original.notes?.trim() || '-'}
        </div>
      ),
      size: 200,
    },
    {
      accessorKey: 'createdBy',
      header: '등록자',
      cell: ({ row }) => {
        const item = row.original;
        // 계약과 발주 모두 계약 테이블에서 가져오므로 createdBy 사용
        return <div className="text-sm">{item.createdBy?.name || '-'}</div>;
      },
      size: 120,
    },
    {
      accessorKey: 'createdAt',
      header: '등록일',
      cell: ({ row }) => <div className="text-sm">{formatDate(row.original.createdAt)}</div>,
      size: 100,
    },
  ], [productCodes]);

  const handleRowClick = (item: PurchaseItem) => {
    const contractId = item.contractId || item.id;
    setSelectedTradeContractId(contractId);
    setContractDetailDrawerOpen(true);
  };

  const handleCreateOrder = () => {
    setSelectedTradeOrder(null);
    setDrawerMode('create');
    setOrderDrawerOpen(true);
  };

  const handleEdit = (item: PurchaseItem) => {
    // 중첩 drawer 방식으로 변경: 상세 drawer는 유지하고 수정 drawer는 상세 drawer 내부에서 열림
    // 따라서 여기서는 아무것도 하지 않음 (상세 drawer 내부에서 처리)
  };

  const handleCancelEdit = () => {
    // 중첩 drawer 방식으로 변경: 상세 drawer 내부에서 처리하므로 여기서는 불필요
    setContractDrawerOpen(false);
    setOrderDrawerOpen(false);
    setSelectedTradeContract(null);
    setSelectedTradeOrder(null);
  };

  const handleDelete = (item: PurchaseItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      // 목록·계약 상세는 tc_id. 주문 상세에서 잘못 넘긴 경우 to_id 대신 부모 계약 id 사용
      const contractId = itemToDelete.contractId || itemToDelete.id;
      await deleteContractMutation.mutateAsync(contractId);
      toastSuccess('삭제 완료', itemToDelete.type === 'contract' ? '계약 항목이 삭제되었습니다.' : '발주가 삭제되었습니다.');
      setContractDetailDrawerOpen(false);
      await refetchContracts();
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch (error: unknown) {
      toastApiError(error as Parameters<typeof toastApiError>[0], '삭제 실패');
    }
  };

  const handleContractFormSubmit = async () => {
    setContractDrawerOpen(false);
    setSelectedTradeContract(null);
    await refetchContracts();
  };

  const handleOrderFormSubmit = async () => {
    setOrderDrawerOpen(false);
    setSelectedTradeOrder(null);
    await refetchContracts();
  };

  const handleOrderFormCancel = () => {
    setOrderDrawerOpen(false);
    setSelectedTradeOrder(null);
  };

  const paginatedItems = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return sortedItems.slice(start, end);
  }, [sortedItems, page, pageSize]);

  return (
    <AppLayout user={user}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 md:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">구매관리</h1>
            <p className="hidden text-muted-foreground md:block">
              발주와 계약 정보를 통합하여 조회하고 관리합니다.
            </p>
          </div>
          <Button size="sm" onClick={handleCreateOrder}>
            <Plus className="mr-2 h-4 w-4" />
            {!isMobile && '발주 등록'}
          </Button>
        </div>

        <PurchaseManagementDataTable
          columns={columns}
          data={paginatedItems}
          columnSettingsIconOnly={true}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          page={page}
          pageSize={pageSize}
          total={sortedItems.length}
          totalPages={Math.max(1, Math.ceil(sortedItems.length / pageSize))}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            Cookies.set('data-table-page-size', size.toString());
          }}
          manualPagination={true}
          enableSorting={true}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          rowClassName="h-10"
          filterControls={
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">계약번호</Label>
                <Input
                  type="text"
                  placeholder="계약번호 검색"
                  value={contractNo}
                  onChange={(e) => {
                    setContractNo(e.target.value);
                    setPage(1);
                  }}
                  className="w-40 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">수출사</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {availableExporters.length === 0
                        ? '전체'
                        : selectedExporters.size === availableExporters.length
                          ? '전체'
                          : selectedExporters.size === 0
                            ? '선택 안됨'
                            : `${selectedExporters.size}개 선택됨`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 max-h-[70vh] overflow-y-auto" align="start">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <Checkbox
                            id="trade-exporter-filter-all"
                            checked={availableExporters.length === 0 || selectedExporters.size === availableExporters.length}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedExporters(new Set(availableExporters));
                              } else {
                                setSelectedExporters(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label htmlFor="trade-exporter-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                            전체
                          </Label>
                        </div>
                        {availableExporters.map((code) => {
                          const codeInfo = exporterCodes.find((c) => (c.value ?? '').trim() === code);
                          const label = codeInfo ? codeInfo.name : code;
                          return (
                            <div key={code} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                              <Checkbox
                                id={`trade-exporter-filter-${code}`}
                                checked={selectedExporters.has(code)}
                                onCheckedChange={(checked: boolean) => {
                                  const next = new Set(selectedExporters);
                                  if (checked) next.add(code);
                                  else next.delete(code);
                                  setSelectedExporters(next);
                                  setPage(1);
                                }}
                              />
                              <Label htmlFor={`trade-exporter-filter-${code}`} className="text-sm font-medium cursor-pointer flex-1">
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
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {availableProducts.length === 0
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
                            id={`${tradeProductFilterDomId}-all`}
                            checked={availableProducts.length === 0 || allProductsSelected}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                setSelectedProducts(new Set(availableProducts));
                              } else if (checked === false) {
                                setSelectedProducts(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label htmlFor={`${tradeProductFilterDomId}-all`} className="text-sm font-medium cursor-pointer flex-1">
                            전체
                          </Label>
                        </div>
                        {availableProducts.map((product, index) => {
                          const productCode = productCodes.find((code) => code.value === product);
                          const label = productCode ? productCode.name : product;
                          return (
                            <div key={product} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                              <Checkbox
                                id={`${tradeProductFilterDomId}-row-${index}`}
                                checked={selectedProducts.has(product)}
                                onCheckedChange={(checked) => {
                                  const next = new Set(selectedProducts);
                                  if (checked === true) next.add(product);
                                  else if (checked === false) next.delete(product);
                                  setSelectedProducts(next);
                                  setPage(1);
                                }}
                              />
                              <Label htmlFor={`${tradeProductFilterDomId}-row-${index}`} className="text-sm font-medium cursor-pointer flex-1">
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
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상태</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-40 justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {selectedStatuses.size === statusOptions.length
                        ? '전체'
                        : selectedStatuses.size === 0
                          ? '선택 안됨'
                          : `${selectedStatuses.size}개 선택됨`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="start">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                          <Checkbox
                            id="trade-status-filter-all"
                            checked={selectedStatuses.size === statusOptions.length}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedStatuses(new Set(statusOptions.map((s) => s.value)));
                              } else {
                                setSelectedStatuses(new Set());
                              }
                              setPage(1);
                            }}
                          />
                          <Label htmlFor="trade-status-filter-all" className="text-sm font-medium cursor-pointer flex-1">
                            전체
                          </Label>
                        </div>
                        {statusOptions.map((status) => (
                          <div key={status.value} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <Checkbox
                              id={`trade-status-filter-${status.value}`}
                              checked={selectedStatuses.has(status.value)}
                              onCheckedChange={(checked: boolean) => {
                                const next = new Set(selectedStatuses);
                                if (checked) next.add(status.value);
                                else next.delete(status.value);
                                setSelectedStatuses(next);
                                setPage(1);
                              }}
                            />
                            <Label htmlFor={`trade-status-filter-${status.value}`} className="text-sm font-medium cursor-pointer flex-1">
                              {status.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">등록자</Label>
                <Select
                  value={selectedManagerUserId}
                  onValueChange={(value) => {
                    setSelectedManagerUserId(value);
                    // 쿠키에 무역 권한 등록자 ID 저장
                    Cookies.set('trade-manager-user-id', value, { expires: 365 }); // 1년간 유지
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40" size="sm">
                    <SelectValue placeholder="등록자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">전체</SelectItem>
                    {availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          }
        />

        {/* 계약 수정 drawer는 상세 drawer 내부에서 처리하므로, create 모드일 때만 페이지에서 렌더링 */}
        <TradeContractFormDrawer
          open={contractDrawerOpen && drawerMode === 'create'}
          onOpenChange={(open) => {
            setContractDrawerOpen(open);
            if (!open) {
              setSelectedTradeContract(null);
            }
          }}
          mode="create"
          contract={null}
          onSubmit={handleContractFormSubmit}
          onCancel={handleCancelEdit}
        />

        <TradeContractDetailDrawer
          open={contractDetailDrawerOpen}
          onOpenChange={(open) => {
            setContractDetailDrawerOpen(open);
            if (!open) {
              setSelectedTradeContractId(null);
            }
          }}
          contractId={selectedTradeContractId}
          onEdit={(contract) => handleEdit({ ...contract, type: 'contract' })}
          onDelete={(contract) => handleDelete({ ...contract, type: 'contract' })}
        />

        {/* 발주 수정 drawer는 상세 drawer 내부에서 처리하므로, create 모드일 때만 페이지에서 렌더링 */}
        <TradeOrderFormDrawer
          open={orderDrawerOpen && drawerMode === 'create'}
          onOpenChange={(open) => {
            setOrderDrawerOpen(open);
            if (!open) {
              handleOrderFormCancel();
            }
          }}
          mode="create"
          tradeOrder={null}
          onSubmit={handleOrderFormSubmit}
          onCancel={handleOrderFormCancel}
        />

        <TradeOrderDetailDrawer
          open={orderDetailDrawerOpen}
          onOpenChange={(open) => {
            setOrderDetailDrawerOpen(open);
            if (!open) {
              setSelectedTradeOrderId(null);
            }
          }}
          tradeOrderId={selectedTradeOrderId}
          onEdit={(order) => handleEdit({ ...order, type: 'order' } as PurchaseItem)}
          onDelete={(order) => handleDelete({ ...order, type: 'order' } as PurchaseItem)}
        />

        <DeleteConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title={itemToDelete?.type === 'contract' ? '계약 삭제' : '발주 삭제'}
          description={
            <>
              이 {itemToDelete?.type === 'contract' ? '계약' : '발주'} 항목을 삭제하시겠습니까?
              <br />
              <span className="font-medium text-destructive">삭제된 데이터는 복구할 수 없습니다.</span>
            </>
          }
          onConfirm={confirmDelete}
          isDeleting={deleteContractMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}

export default function PurchaseManagementPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <PurchaseManagementPageContent />
    </Suspense>
  );
}

