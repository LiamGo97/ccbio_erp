'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ColumnDef, RowSelectionState, OnChangeFn } from '@tanstack/react-table';
import { CheckSquare, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { SalesDetail } from '@/lib/hooks/use-sales';
import { DataTable } from '@/components/ui/data-table';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useSales, Sales, SalesProductInfo } from '@/lib/hooks/use-sales';
import { useAvailableSalesItems, AvailableSalesItem } from '@/lib/hooks/use-invoices';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { usePrepayments, PrepaymentListItem } from '@/lib/hooks/use-prepayments';
import Cookies from 'js-cookie';
import { useColumnSettings } from '@/hooks/use-column-settings';

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

export interface SalesItemForInvoice {
  id: string;
  salesId: string;
  productName: string;
  specification?: string | null;
  weight?: number | null;
  unitPrice?: number | null;
  containerNo?: string | null;
  salesDate?: string | null;
  deliveryOrderNumber?: string | null;
  sales?: {
    id: string;
    customer?: {
      id?: string;
      companyName?: string | null;
      phone?: string | null;
      ceo?: string | null;
    } | null;
  };
  // 판매관리 목록에서 사용하는 추가 필드
  itemId?: string;
  containerId?: string;
  sequence?: number | null;
  bl?: string | null;
  packingType?: string | null;
  packingName?: string | null;
  exporter?: string | null | undefined;
  exporterName?: string | null | undefined;
  tradeGrade?: string | null;
  tradeGradeName?: string | null;
  salesGrade?: string | null;
  salesGradeName?: string | null;
  containerType?: 'CONTAINER' | 'CARGO';
  bales?: number | null;
  salesBales?: number | null; // 영업 베일
  tradeBales?: number | null; // 무역 베일
  cargoBales?: number | null;
  cargoWeight?: number | null;
  margin?: number | null;
  exchangeRate?: number | null;
  etaDate?: string | null;
  inboundStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;
  inboundWarehouse?: string | null;
  inboundWarehouseName?: string | null;
}

export interface SalesItemSelectDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesList?: SalesDetail[]; // 선택적: 제공되면 해당 판매들만 필터링
  salesIds?: string[]; // 선택적: 특정 판매 ID들로 필터링
  excludedItemIds?: string[]; // 선택적: 제외할 항목 ID 목록 (이미 거래명세서에 추가된 항목)
  onSelect?: (items: SalesItemForInvoice[]) => void;
}

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export function SalesItemSelectDrawer({
  open,
  onOpenChange,
  salesList,
  salesIds,
  excludedItemIds = [],
  onSelect,
}: SalesItemSelectDrawerProps) {
  const isMobile = useIsMobile();
  const columnSettings = useColumnSettings('sales-invoice-item-select');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [searchInputValue, setSearchInputValue] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedProduct, setSelectedProduct] = React.useState<string>('__all__');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(getInitialPageSize);
  const [sortBy, setSortBy] = React.useState<string>('salesCreatedAt');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const searchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: packingTypeCodes = [] } = useCodeMastersByGroup('PACKING_TYPE');

  // 검색 입력 디바운스: 입력은 즉시 반영, API 호출은 400ms 후 한 번만
  React.useEffect(() => {
    if (!open) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchInputValue.trim());
      setPage(1);
      searchDebounceRef.current = null;
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [open, searchInputValue]);

  // 텍스트 선택(드래그·더블클릭)이 vaul 드래그/닫기와 충돌하지 않도록 (거래명세서 발행 Drawer와 동일)
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    e.stopPropagation();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange]);

  // 이미 발행된 거래명세서에 포함된 항목을 제외한 판매 항목 조회
  const { data: availableItemsResponse, isLoading } = useAvailableSalesItems({
    page,
    limit: pageSize,
    search: searchQuery || undefined,
    product: selectedProduct !== '__all__' ? selectedProduct : undefined,
    sortBy: sortBy || undefined,
    sortOrder: sortOrder || undefined,
  });

  const availableItems = availableItemsResponse?.data || [];
  const totalSales = availableItemsResponse?.total || 0;

  // 모든 항목의 salesId 수집
  const allSalesIds = React.useMemo(() => {
    const salesIds = new Set<string>();
    availableItems.forEach(item => {
      if (item.salesId) {
        salesIds.add(item.salesId);
      }
    });
    return Array.from(salesIds);
  }, [availableItems]);

  // 선입금 정보 조회 (모든 상태 조회 후 프론트에서 필터링)
  const { data: prepaymentsResponse } = usePrepayments({
    limit: 1000, // 충분히 큰 값으로 설정
  });

  // salesId별 선입금 정보 맵 생성
  const prepaymentMap = React.useMemo(() => {
    if (!prepaymentsResponse?.data) return new Map<string, PrepaymentListItem[]>();
    
    const map = new Map<string, PrepaymentListItem[]>();
    prepaymentsResponse.data.forEach(prepayment => {
      if (prepayment.salesId) {
        const existing = map.get(prepayment.salesId) || [];
        // REQUESTED(청구됨), CONFIRMED(입금확인), AVAILABLE 상태 표시
        // 차감되지 않은 선입금만 포함
        if (
          prepayment.deductionStatus !== 'DEDUCTED' &&
          (prepayment.paymentStatus === 'REQUESTED' || 
          prepayment.paymentStatus === 'CONFIRMED' || 
          prepayment.paymentStatus === 'AVAILABLE')
        ) {
          existing.push(prepayment);
          map.set(prepayment.salesId, existing);
        }
      }
    });
    return map;
  }, [prepaymentsResponse]);

  // 각 항목의 선입금 정보 가져오기
  const getPrepaymentInfo = (salesId: string) => {
    const prepayments = prepaymentMap.get(salesId) || [];
    if (prepayments.length === 0) return null;
    
    // 총 선입금 금액 계산
    const totalAmount = prepayments.reduce((sum, p) => {
      const amount = p.actualAmount || p.prepaymentAmount;
      return sum + amount;
    }, 0);
    
    return {
      count: prepayments.length,
      totalAmount,
      prepayments,
    };
  };

  // 제품 필터 및 제외 항목 필터 적용
  const filteredItems = React.useMemo(() => {
    let items: SalesItemForInvoice[] = availableItems
      .filter((item) => {
        // 이미 선택된 항목은 제외
        if (excludedItemIds.includes(item.itemId || item.id)) {
          return false;
        }
        
        // 제품 필터 적용 (백엔드에서도 처리하지만, 프론트엔드에서도 한 번 더 확인)
        if (selectedProduct !== '__all__') {
          const productValue = item.productName || '';
          if (productValue !== selectedProduct) return false;
        }
        
        return true;
      })
      .map((item, index) => ({
        id: item.itemId || item.id || `${item.salesId}_${index}`,
        salesId: item.salesId,
        productName: item.productName || '-',
        specification: item.specification || null,
        weight: item.weight || null,
        cargoWeight: item.cargoWeight || null,
        unitPrice: item.unitPrice || null,
        containerNo: item.containerNo || null,
        sales: item.sales || {
          id: item.salesId,
          customer: null,
        },
        // 추가 필드
        itemId: item.itemId || item.id, // 판매 항목 ID (tb_sales_item.si_id)
        containerId: item.containerId || undefined,
        sequence: item.sequence || null,
        bl: item.bl || null,
        packingType: item.packingType || null,
        packingName: item.packingName || null,
        exporter: item.exporter || undefined,
        exporterName: item.exporterName || undefined,
        tradeGrade: item.tradeGrade || null,
        tradeGradeName: item.tradeGradeName || null,
        salesGrade: item.salesGrade || null,
        salesGradeName: item.salesGradeName || null,
        containerType: item.containerType || 'CONTAINER',
        bales: (item.salesBales ?? item.tradeBales) ?? null,
        cargoBales: item.cargoBales || null,
        margin: item.margin || null,
        exchangeRate: item.exchangeRate || null,
        etaDate: item.etaDate || null,
        inboundStatus: item.inboundStatus || null,
        inboundWarehouse: item.inboundWarehouse || null,
        inboundWarehouseName: item.inboundWarehouseName || null,
        salesDate: item.salesDate || null,
        deliveryOrderNumber: item.deliveryOrderNumber || null,
      }));

    return items;
  }, [availableItems, selectedProduct, excludedItemIds]);

  // 총 항목 수
  const totalItems = filteredItems.length;

  // 확인 버튼 클릭
  const handleConfirm = () => {
    const selectedIds = Object.keys(rowSelection).filter(key => rowSelection[key]);
    if (selectedIds.length === 0) return;

    // 고객 검증
    if (hasMultipleCustomers) {
      toast({
        title: '선택 불가',
        description: `거래명세서는 한 고객에 대해서만 발행할 수 있습니다. 현재 ${selectedCustomers.length}개의 서로 다른 고객이 선택되었습니다: ${selectedCustomers.join(', ')}. 동일한 고객의 항목만 선택해주세요.`,
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    if (onSelect) {
      const itemsToSelect = filteredItems.filter(item => selectedIds.includes(item.id));
      onSelect(itemsToSelect as SalesItemForInvoice[]);
      onOpenChange(false);
      // 초기화
      setRowSelection({});
      setSearchInputValue('');
      setSearchQuery('');
      setSelectedProduct('__all__');
      setPage(1);
    }
  };

  // Drawer 닫기 시 초기화
  React.useEffect(() => {
    if (!open) {
      setRowSelection({});
      setSearchInputValue('');
      setSearchQuery('');
      setSelectedProduct('__all__');
      setPage(1);
      setSortBy('salesCreatedAt');
      setSortOrder('desc');
    }
  }, [open]);

  // 제품 필터, 검색, 정렬 변경 시 페이지 리셋
  React.useEffect(() => {
    setPage(1);
  }, [selectedProduct, searchQuery, sortBy, sortOrder]);

  const handleSortChange = React.useCallback((newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setPage(1);
  }, []);

  // 선택된 항목 수
  const selectedCount = Object.keys(rowSelection).filter(key => rowSelection[key]).length;

  // 선택된 항목들의 고객 확인
  const selectedItems = React.useMemo(() => {
    const selectedIds = Object.keys(rowSelection).filter(key => rowSelection[key]);
    return filteredItems.filter(item => selectedIds.includes(item.id));
  }, [rowSelection, filteredItems]);

  // 선택된 항목들의 고객 목록 (중복 제거)
  const selectedCustomers = React.useMemo(() => {
    const customers = new Set<string>();
    selectedItems.forEach(item => {
      const customerName = item.sales?.customer?.companyName;
      if (customerName) {
        customers.add(customerName);
      }
    });
    return Array.from(customers);
  }, [selectedItems]);

  // 여러 고객이 선택되었는지 확인
  const hasMultipleCustomers = selectedCustomers.length > 1;

  // rowSelection 변경 시 고객 검증
  React.useEffect(() => {
    if (hasMultipleCustomers && selectedCount > 0) {
      toast({
        title: '고객 선택 경고',
        description: `거래명세서는 한 고객에 대해서만 발행할 수 있습니다. 현재 ${selectedCustomers.length}개의 서로 다른 고객이 선택되었습니다: ${selectedCustomers.join(', ')}`,
        variant: 'destructive',
        duration: 5000,
      });
    }
  }, [hasMultipleCustomers, selectedCustomers, selectedCount]);

  // 제품명 맵 생성 (판매관리 페이지와 동일)
  const productMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (productCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [productCodes]);

  const getProductName = (productCode?: string | null) => {
    if (!productCode) return '-';
    return productMap.get(productCode) || productCode;
  };

  // DataTable 컬럼 정의 (판매관리 페이지의 productInfo 테이블과 유사하게 구성)
  const columns: ColumnDef<SalesItemForInvoice>[] = React.useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <div className="flex items-center justify-center w-full px-2">
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              onClick={(e) => e.stopPropagation()}
              aria-label="전체 선택"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center w-full px-2">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              onClick={(e) => e.stopPropagation()}
              aria-label="행 선택"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 50,
      },
      {
        accessorKey: 'customerName',
        header: '고객명',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.sales?.customer?.companyName || '-'}</div>
        ),
        size: 150,
      },
      {
        accessorKey: 'deliveryOrderNumber',
        header: '운송번호',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.deliveryOrderNumber || '-'}</div>
        ),
        size: 160,
      },
      {
        accessorKey: 'salesDate',
        header: '판매일자',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.salesDate
              ? new Date(row.original.salesDate).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                })
              : '-'}
          </div>
        ),
        size: 120,
      },
      {
        accessorKey: 'inboundWarehouseName',
        header: '창고',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.inboundWarehouseName || row.original.inboundWarehouse || '-'}</div>
        ),
        enableSorting: false,
        size: 100,
      },
      {
        accessorKey: 'bl',
        header: 'BL',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.bl || '-'}</div>
        ),
        size: 140,
      },
      {
        accessorKey: 'containerNo',
        header: '컨테이너',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.containerNo || '-'}
            {row.original.containerNo && row.original.sequence != null && ` [${row.original.sequence}]`}
          </div>
        ),
        size: 150,
      },
      {
        accessorKey: 'productName',
        header: '상품명',
        cell: ({ row }) => (
          <div className="text-sm">{getProductName(row.original.productName)}</div>
        ),
        size: 120,
      },
      {
        accessorKey: 'packingName',
        header: '패킹 타입',
        cell: ({ row }) => {
          const item = row.original;
          // packingName이 있으면 우선 사용
          if (item.packingName) {
            return <div className="text-sm">{item.packingName}</div>;
          }
          // packingType 코드를 이름으로 변환
          const packingCode = item.packingType;
          if (packingCode) {
            const packingType = packingTypeCodes.find((c) => c.value === packingCode || c.name === packingCode);
            return <div className="text-sm">{packingType?.name || packingCode}</div>;
          }
          return <div className="text-sm">-</div>;
        },
        size: 100,
      },
      {
        accessorKey: 'tradeGradeName',
        header: '등급(무역)',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.tradeGradeName || row.original.tradeGrade || '-'}</div>
        ),
        size: 100,
      },
      {
        accessorKey: 'salesGradeName',
        header: '등급(영업)',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.salesGradeName || row.original.salesGrade || '-'}</div>
        ),
        size: 100,
      },
      {
        accessorKey: 'containerType',
        header: '타입',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.containerType === 'CARGO' ? '카고' : '컨테이너'}</div>
        ),
        size: 80,
      },
      {
        accessorKey: 'bales',
        header: '베일(영업)',
        cell: ({ row }) => (
          <div className="text-sm text-right">
            {(() => { const b = row.original.salesBales ?? row.original.tradeBales; return b != null ? Math.round(Number(b)).toLocaleString('ko-KR') : '-'; })()}
          </div>
        ),
        size: 80,
      },
      {
        accessorKey: 'weight',
        header: '중량 (KG)',
        cell: ({ row }) => (
          <div className="text-sm text-right">
            {row.original.weight !== null && row.original.weight !== undefined ? formatNumber(Math.round(row.original.weight * 1000), 0) : '-'}
          </div>
        ),
        size: 80,
      },
      {
        accessorKey: 'unitPrice',
        header: '판매단가',
        cell: ({ row }) => (
          <div className="text-sm text-right">
            {row.original.unitPrice ? formatNumber(row.original.unitPrice, 2) : '-'}
          </div>
        ),
        size: 100,
      },
      {
        accessorKey: 'prepayment',
        header: '선입금',
        enableSorting: false,
        cell: ({ row }) => {
          const prepaymentInfo = getPrepaymentInfo(row.original.salesId);
          if (!prepaymentInfo) {
            return <div className="text-sm text-muted-foreground">-</div>;
          }
          return (
            <div className="text-sm text-right">
              <div className="font-medium text-blue-600 dark:text-blue-400">
                {formatNumber(prepaymentInfo.totalAmount, 0)}원
              </div>
              {prepaymentInfo.count > 1 && (
                <div className="text-xs text-muted-foreground">
                  ({prepaymentInfo.count}건)
                </div>
              )}
            </div>
          );
        },
        size: 120,
      }
    ],
    [productMap, getProductName, prepaymentMap, packingTypeCodes],
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full flex flex-col"
        style={{
          width: isMobile ? '100%' : '1200px',
          maxWidth: '95vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <DrawerTitle>판매 항목 선택</DrawerTitle>
              <DrawerDescription>
                판매 완료되고 거래명세서가 발행되지 않은 항목 중에서 거래명세서에 포함할 항목을 선택하세요.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {/* 항목 목록 - 로딩 시에도 테이블 헤더/검색/필터는 유지, 테이블 바디만 로딩 표시 */}
            <DataTable
              columns={columns}
              data={filteredItems}
              visibleColumns={columnSettings.visibleColumns}
              onVisibleColumnsChange={columnSettings.onVisibleColumnsChange}
              columnSizing={columnSettings.columnSizing}
              onColumnSizingChange={columnSettings.onColumnSizingChange}
              columnOrder={columnSettings.columnOrder}
              onColumnOrderChange={columnSettings.onColumnOrderChange}
              columnSettingsIconOnly
              enableRowSelection={true}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              getRowId={(row) => row.id}
              noRowClickColumnIds={['select']}
              onRowClick={(row) => {
                const rowId = row.id;
                setRowSelection((prev) => ({
                  ...prev,
                  [rowId]: !(prev[rowId] ?? false),
                }));
              }}
              page={page}
              pageSize={pageSize}
              total={totalSales}
              totalPages={availableItemsResponse?.lastPage || 1}
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
              searchKey="search"
              searchValue={searchInputValue}
              onSearchChange={setSearchInputValue}
              searchPlaceholder="업체명, 고객명 검색"
              isLoading={isLoading}
              showRowNumber={false}
              filterControls={
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
                    <Select
                      value={selectedProduct || '__all__'}
                      onValueChange={(value) => {
                        setSelectedProduct(value);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-40" size="sm">
                        <SelectValue placeholder="상품 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">전체</SelectItem>
                        {productCodes?.map((product) => (
                          <SelectItem key={product.id} value={product.value ?? product.name ?? ''}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              }
            />
          </div>

          <DrawerFooter className="border-t border-border flex-shrink-0 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-muted-foreground">
                    {selectedCount}개 선택됨 (현재 페이지: {filteredItems.length}개 / 전체 판매: {totalSales}개)
                  </p>
                  {hasMultipleCustomers && selectedCount > 0 && (
                    <p className="text-sm text-destructive font-medium">
                      ⚠️ {selectedCustomers.length}개의 서로 다른 고객이 선택되었습니다. 거래명세서는 한 고객에 대해서만 발행할 수 있습니다.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <DrawerClose asChild>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      <X className="mr-1.5 h-4 w-4" />
                      취소
                    </Button>
                  </DrawerClose>
                  <Button
                    type="button"
                    onClick={handleConfirm}
                    disabled={selectedCount === 0 || hasMultipleCustomers}
                  >
                    <CheckSquare className="mr-2 h-4 w-4" />
                    선택 완료 ({selectedCount}개)
                  </Button>
                </div>
              </div>
            </div>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

