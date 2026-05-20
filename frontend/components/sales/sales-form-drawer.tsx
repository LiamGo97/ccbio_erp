'use client';

import * as React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useForm, type UseFormSetValue } from 'react-hook-form';
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
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Save, Search, Building2, Phone, Plus, CheckSquare, MapPin, Calculator, DollarSign, XCircle, UserCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NumberInput } from '@/components/ui/number-input';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef, RowSelectionState, OnChangeFn } from '@tanstack/react-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useRegions } from '@/lib/hooks/use-regions';
import { useCities } from '@/lib/hooks/use-cities';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useTradeOrders } from '@/lib/hooks/use-trade-orders';
import { DatePicker } from '@/components/schedules/date-picker';
import { useSalesDetail, useUpdateSales, useConfirmSales, UpdateSalesDto } from '@/lib/hooks/use-sales';
import { useVehicleDispatches } from '@/lib/hooks/use-vehicle-dispatch';
import { useSafeFreightRates, useSafeFreightRegionNames, useSafeFreightCityNames, useTownNames, useDistanceKmList } from '@/lib/hooks/use-safe-freight-rates';
import type { DaumPostcodeData } from '@/types/daum-postcode';
import {
  useCustomerDeliveryAddresses,
  type Customer,
  type CustomerDeliveryAddress,
} from '@/lib/hooks/use-customers';
import { CustomerDeliveryAddressFormDialog } from '@/components/customers/customer-delivery-address-form-dialog';
import { formatCustomerListDefaultAddress, resolveDefaultAddressKind } from '@/lib/customer-default-address-kind';
import {
  BlPackingSelectionTable,
  groupContainersByBlPacking,
  type SalesBlPackingSelectRow,
} from '@/components/sales/sales-bl-packing-selection-table';

interface CompanySearchResult {
  id: string;
  phone: string | null;
  companyName: string | null;
  ceo: string | null;
  region?: string | null;
  customerPostalCode?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  addressDetail?: string | null;
  customerAddressRoad?: string | null;
  customerAddressJibun?: string | null;
  customerLegalBCode?: string | null;
  customerAddressDefaultType?: string | null;
}

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

/** BL·패킹 카드에서 입력한 카고 수량을 컨테이너별 가용량 비율로 배분 */
function distributeBlPackingCargo(
  containers: SelectedContainer[],
  totalCargoBales: number,
  totalCargoWeightTon: number,
): Map<string, { cargoBales: number; cargoWeight: number }> {
  const result = new Map<string, { cargoBales: number; cargoWeight: number }>();
  const availBales = containers.map(
    (c) => Number(c.availableBales ?? c.salesBales ?? c.tradeBales ?? 0) || 0,
  );
  const availWeight = containers.map(
    (c) => Number(c.availableWeight ?? c.weight ?? 0) || 0,
  );
  const sumBales = availBales.reduce((a, b) => a + b, 0);
  const sumWeight = availWeight.reduce((a, b) => a + b, 0);
  containers.forEach((c, i) => {
    const balesShare =
      sumBales > 0
        ? (availBales[i] / sumBales) * totalCargoBales
        : totalCargoBales / containers.length;
    const weightShare =
      sumWeight > 0
        ? (availWeight[i] / sumWeight) * totalCargoWeightTon
        : totalCargoWeightTon / containers.length;
    result.set(c.id, { cargoBales: balesShare, cargoWeight: weightShare });
  });
  return result;
}

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  const formatted = value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return formatted;
};

// 주소 검색 API에서 받은 지역명을 DB에 저장된 지역명으로 정규화
const normalizeRegionNameFromAddress = (sido: string): string => {
  const regionMapping: Record<string, string> = {
    '전북특별자치도': '전라북도',
    '전라북도': '전라북도',
    '강원특별자치도': '강원도',
    '강원도': '강원도',
    '제주특별자치도': '제주특별자치도',
    '서울특별시': '서울특별시',
    '부산광역시': '부산광역시',
    '대구광역시': '대구광역시',
    '인천광역시': '인천광역시',
    '광주광역시': '광주광역시',
    '대전광역시': '대전광역시',
    '울산광역시': '울산광역시',
    '세종특별자치시': '세종특별자치시',
    '경기도': '경기도',
    '충청북도': '충청북도',
    '충청남도': '충청남도',
    '전라남도': '전라남도',
    '경상북도': '경상북도',
    '경상남도': '경상남도',
  };
  return regionMapping[sido] || sido;
};

// 컨테이너 선택 테이블 컴포넌트
function ContainerSelectionTable({
  containers,
  gradeCodes,
  salesGradeCodes,
  rowSelection,
  onRowSelectionChange,
  selectedInboundStatus,
  onInboundStatusChange,
  selectedInventoryStatus,
  onInventoryStatusChange,
  selectedProduct,
  onProductChange,
  products,
  bkBlSearch,
  setBkBlSearch,
  onSearch,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder,
  onSortChange,
  productLineKey = 'container',
}: {
  containers: SelectedContainer[];
  gradeCodes: Array<{ value: string; name: string }>;
  salesGradeCodes: Array<{ value: string; name: string }>;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  selectedInboundStatus: string;
  onInboundStatusChange: (value: string) => void;
  selectedInventoryStatus: string;
  onInventoryStatusChange: (value: string) => void;
  selectedProduct: string;
  onProductChange: (value: string) => void;
  products: Array<{ id: string; value?: string | null; name?: string | null }>;
  bkBlSearch: string;
  setBkBlSearch: (value: string) => void;
  onSearch: () => void;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  productLineKey?: 'container' | 'bl';
}) {
  const useBlProductLine = productLineKey === 'bl';
  // 수량 표시 헬퍼 함수 (입고 예정 재고 페이지와 동일한 형식)
  const formatQuantity = React.useCallback((available: number | null, total: number | null, sold: number | null, isInteger: boolean = false) => {
    if (available == null || total == null) return { text: '-', hasSales: false };
    
    // 판매 수량이 0보다 크면 판매 있음
    const hasSales = (sold ?? 0) > 0;
    
    if (hasSales) {
      // 판매가 있으면 "남은수량/전체수량" 형식
      const availableFormatted = isInteger 
        ? Math.round(available).toLocaleString('ko-KR')
        : available.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
      const totalFormatted = isInteger 
        ? Math.round(total).toLocaleString('ko-KR')
        : total.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
      return { 
        text: `${availableFormatted}/${totalFormatted}`, 
        hasSales: true,
        available: availableFormatted,
        total: totalFormatted,
      };
    } else {
      // 판매가 없으면 전체 수량만 표시
      const totalFormatted = isInteger 
        ? Math.round(total).toLocaleString('ko-KR')
        : total.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
      return { 
        text: totalFormatted, 
        hasSales: false,
        available: totalFormatted,
        total: totalFormatted,
      };
    }
  }, []);
  const columns: ColumnDef<SelectedContainer>[] = React.useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <div className="flex items-center justify-center w-full px-2">
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center w-full px-2" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 80,
        minSize: 80,
        maxSize: 80,
      },
      {
        accessorKey: 'inboundStatus',
        header: '입고 상태',
        cell: ({ row }) => {
          const status = row.original.inboundStatus;
          const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
            INBOUND_PENDING: {
              variant: 'outline',
              className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
            },
            INBOUND_SCHEDULED: {
              variant: 'outline',
              className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
            },
            INBOUND_CONFIRMED: {
              variant: 'outline',
              className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
            },
          };
          
          if (!status || !statusStyles[status]) {
            return <span className="text-sm text-muted-foreground">-</span>;
          }
          
          const style = statusStyles[status];
          const statusLabel = status === 'INBOUND_PENDING' ? '입고대기' : status === 'INBOUND_SCHEDULED' ? '입고예정' : '입고확정';
          
          return (
            <Badge variant={style.variant} className={style.className}>
              {statusLabel}
            </Badge>
          );
        },
        size: 100,
      },
      {
        accessorKey: 'inventoryStatus',
        header: '재고 상태',
        cell: ({ row }) => {
          const status = row.original.inventoryStatus;
          if (!status) return <span className="text-sm text-muted-foreground">-</span>;
          
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
            return <span className="text-sm text-muted-foreground">{status}</span>;
          }
          
          return (
            <Badge variant={style.variant} className={style.className}>
              {style.label}
            </Badge>
          );
        },
        size: 100,
      },
      {
        id: 'exportCountryName',
        accessorKey: 'exportCountryName',
        header: '수출국',
        enableSorting: true,
        cell: ({ row }) => row.original.exportCountryName || '-',
        size: 100,
      },
      {
        id: 'exporterName',
        accessorKey: 'exporterName',
        header: '수출사',
        enableSorting: true,
        cell: ({ row }) => row.original.exporterName || '-',
        size: 120,
      },
      {
        accessorKey: 'productName',
        header: '상품',
        cell: ({ row }) => row.original.productName || '-',
        size: 120,
      },
      {
        accessorKey: 'bk',
        header: 'BK',
        cell: ({ row }) => {
          const bk = row.original.bk;
          return bk || '-';
        },
        size: 150,
      },
      {
        accessorKey: 'bl',
        header: 'BL',
        cell: ({ row }) => {
          const bl = row.original.bl;
          return bl || '-';
        },
        size: 150,
      },
      ...(useBlProductLine
        ? []
        : [
            {
              accessorKey: 'containerNo',
              header: '컨테이너 번호',
              cell: ({ row }: { row: { original: SelectedContainer } }) => {
                const containerNo = row.original.containerNo;
                const sequence = row.original.sequence;
                const displayText =
                  sequence != null ? `${containerNo} [${sequence}]` : containerNo;
                return <span className="font-medium">{displayText}</span>;
              },
              size: 150,
            } as ColumnDef<SelectedContainer>,
          ]),
      {
        accessorKey: 'etaDate',
        header: 'ETA',
        cell: ({ row }) => {
          const date = row.original.etaDate;
          return date ? new Date(date).toLocaleDateString('ko-KR') : '-';
        },
        size: 120,
      },
      {
        accessorKey: 'warehouseName',
        header: '창고',
        cell: ({ row }) => {
          const warehouseName = row.original.warehouseName;
          return warehouseName || '-';
        },
        size: 120,
      },
      {
        accessorKey: 'tradeGrade',
        header: '등급(무역)',
        cell: ({ row }) => {
          const grade = row.original.tradeGrade;
          return gradeCodes.find((c) => c.value === grade)?.name || grade || '-';
        },
        size: 120,
      },
      {
        accessorKey: 'salesGrade',
        header: '등급(영업)',
        cell: ({ row }) => {
          const grade = row.original.salesGrade;
          return salesGradeCodes.find((c) => c.value === grade)?.name || grade || '-';
        },
        size: 120,
      },
      {
        accessorKey: 'availableWeight',
        header: '중량 (KG)',
        cell: ({ row }) => {
          const avail = row.original.availableWeight ?? row.original.weight;
          const total = row.original.weight;
          const sold = row.original.soldWeight ?? null;
          const result = formatQuantity(
            avail != null ? avail * 1000 : null,
            total != null ? total * 1000 : null,
            sold != null ? sold * 1000 : null,
            true // KG는 정수
          );
          if (result.hasSales) {
            return (
              <div className="flex items-center gap-1">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{result.available}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">{result.total}</span>
              </div>
            );
          }
          return <div>{result.text}</div>;
        },
        size: 120,
      },
      {
        accessorKey: 'availableBales',
        header: '베일(영업)',
        cell: ({ row }) => {
          const result = formatQuantity(
            row.original.availableBales ?? row.original.salesBales ?? row.original.tradeBales ?? null,
            (row.original.salesBales ?? row.original.tradeBales) ?? null,
            row.original.soldBales ?? null,
            true // 베일은 정수
          );
          if (result.hasSales) {
            return (
              <div className="flex items-center gap-1">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{result.available}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">{result.total}</span>
              </div>
            );
          }
          return <div>{result.text}</div>;
        },
        size: 100,
      },
      {
        accessorKey: 'pendingPurchaseCost',
        header: '예정원가',
        cell: ({ row }) => {
          const container = row.original;
          if (!container.pendingPurchaseCost) return '-';
          return (
            <div className="flex flex-col items-end">
              <span>{Number(container.pendingPurchaseCost).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {container.comparisonExchangeRate != null && (
                <span className="text-xs text-muted-foreground">
                  (환율: {Number(container.comparisonExchangeRate).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })})
                </span>
              )}
            </div>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'confirmedPurchaseCost',
        header: '확정원가',
        cell: ({ row }) => {
          const container = row.original;
          if (!container.confirmedPurchaseCost) return '-';
          return (
            <div className="flex flex-col items-end">
              <span>{Number(container.confirmedPurchaseCost).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {container.appliedExchangeRate != null && container.appliedExchangeRate !== undefined && (
                <span className="text-xs text-muted-foreground">
                  (환율: {Number(container.appliedExchangeRate).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })})
                </span>
              )}
            </div>
          );
        },
        size: 150,
      },
    ],
    [gradeCodes, salesGradeCodes, formatQuantity, useBlProductLine],
  );

  return (
    <DataTable
      columns={columns}
      data={containers}
      enableRowSelection={true}
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      getRowId={(row) => row.id}
      enableSorting={true}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortChange={onSortChange}
      onRowClick={(row) => {
        // 텍스트 선택(드래그) 중일 때는 행 클릭 무시 → 복사 동작 방해하지 않음
        if (typeof window !== 'undefined' && (window.getSelection()?.toString() ?? '').length > 0) {
          return;
        }
        // 로우 클릭 시 체크박스 토글 (체크박스 셀 클릭은 제외)
        const rowId = row.id;
        const currentSelection = rowSelection[rowId] || false;
        onRowSelectionChange({
          ...rowSelection,
          [rowId]: !currentSelection,
        });
      }}
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      manualPagination={true}
      filterControls={
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">검색</Label>
            <Input
              className="w-64 h-9"
              placeholder="BK, BL, 상품 등 검색되는 항목"
              value={bkBlSearch}
              onChange={(e) => setBkBlSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSearch();
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">입고 상태</Label>
            <Select
              value={selectedInboundStatus || '__all__'}
              onValueChange={onInboundStatusChange}
            >
              <SelectTrigger className="w-40" size="sm">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                <SelectItem value="INBOUND_PENDING">입고대기</SelectItem>
                <SelectItem value="INBOUND_SCHEDULED">입고예정</SelectItem>
                <SelectItem value="INBOUND_CONFIRMED">입고확정</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">재고 상태</Label>
            <Select
              value={selectedInventoryStatus || '__all__'}
              onValueChange={onInventoryStatusChange}
            >
              <SelectTrigger className="w-40" size="sm">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                <SelectItem value="AVAILABLE">가용</SelectItem>
                <SelectItem value="RESERVED">예약됨</SelectItem>
                <SelectItem value="PARTIALLY_RESERVED">부분 예약</SelectItem>
                <SelectItem value="PARTIALLY_SOLD">부분 판매중</SelectItem>
                <SelectItem value="PARTIALLY_SOLD_COMPLETED">부분 판매완료</SelectItem>
                <SelectItem value="SELLING">판매중</SelectItem>
                <SelectItem value="SOLD_OUT">판매 완료</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm font-medium text-muted-foreground">상품</Label>
            <Select
              value={selectedProduct || '__all__'}
              onValueChange={onProductChange}
            >
              <SelectTrigger className="w-40" size="sm">
                <SelectValue placeholder="상품 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                {products?.map((product) => (
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
  );
}

interface SelectedContainer {
  id: string;
  containerNo: string;
  orderId: string;
  contractNo: string | null;
  bk?: string | null; // BK 번호
  bl?: string | null; // BL 번호
  packingType?: string | null;
  packingName?: string | null;
  sequence: number | null;
  orderCount?: number;
  productName: string | null;
  product: string | null;
  exporterName?: string | null;
  exportCountryName?: string | null;
  tradeGrade: string | null;
  tradeGradeName: string | null;
  salesGrade: string | null;
  salesGradeName: string | null;
  weight: number | null;
  bales: number | null;
  salesBales?: number | null; // 영업 베일
  tradeBales?: number | null; // 무역 베일
  availableBales?: number | null; // 판매 수량 차감 후 가용 베일 수량
  soldBales?: number | null; // 판매된 베일 수량
  availableWeight?: number | null; // 판매 수량 차감 후 가용 중량
  soldWeight?: number | null; // 판매된 중량
  unitPrice: number | null;
  etaDate: string | null;
  warehouseId?: number | null; // 창고 ID
  warehouseName?: string | null; // 창고명
  pendingPurchaseCost: string | null;
  /** 예정 원가(원화 kg당). 판매예약 시 마진 계산에 사용. 있으면 pendingPurchaseCost 대신 사용 */
  comparisonPurchaseCost?: number | null;
  confirmedPurchaseCost: string | null;
  inboundStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;
  inventoryStatus?: 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null; // 재고 상태
  comparisonExchangeRate?: number | null; // 예정원가 계산에 사용된 환율 (판매환율)
  appliedExchangeRate?: number | null; // 확정원가 계산에 사용된 환율 (ETA환율 + 10)
  // 판매 정보 (폼에서 입력)
  containerType?: 'CONTAINER' | 'CARGO' | null;
  cargoBales?: number | null;
  cargoWeight?: number | null;
  salesUnitPrice?: number | null;
  salesUnitPriceStage?: string | null; // 판매 단가 구분 (LOADING/ARRIVAL/UNLOADING)
  margin?: number | null;
  salesPrice?: number | null; // 판매가
  stoCost?: number | null;
  dtCost?: number | null;
  /** 창고 작업비 — DB co_work_fee */
  workFee?: number | null;
  /** 현장 작업비 — DB co_onsite_work_fee */
  onsiteWorkFee?: number | null;
  advancePaymentRatio?: number | null;
  status?: string | null; // 판매 항목 상태
  itemId?: string | null; // 판매 항목 ID (edit 모드용)
  containerId?: string | null; // 컨테이너 ID (edit 모드용)
}

interface SalesFormData {
  customerId?: string | null;
  phone?: string;
  companyName?: string;
  ceo?: string;
  region?: string;
  customerPostalCode?: string;
  customerAddress?: string;
  /** 도로명 한 줄(카카오 road_address + 괄호 보조) */
  customerAddressRoad?: string;
  /** 지번 한 줄 */
  customerAddressJibun?: string;
  /** 법정동코드 10자리 (화면 비표시, 검색·저장용) */
  customerLegalBCode?: string;
  /** Daum 선택 구분 ROAD|JIBUN — 하차지 한 줄 계산에 사용 */
  customerAddressDefaultType?: string;
  customerCity?: string;
  addressDetail?: string;
  // 하차지 주소
  unloadingPostalCode?: string;
  unloadingAddress?: string;
  /** 도로명 한 줄 (등록 시 검색·배송지 반영, API 제출은 unloadingAddress 한 줄) */
  unloadingAddressRoad?: string;
  unloadingAddressJibun?: string;
  unloadingLegalBCode?: string;
  unloadingAddressDefaultType?: string;
  unloadingAddressDetail?: string;
  unloadingRegion?: string;
  unloadingCity?: string;
  productId?: string;
  productName?: string;
  selectedContainers?: SelectedContainer[];
  reservationDate?: string; // 예정일
  salesDate?: string; // 판매일
  requestVehicle?: string | null; // 요청 차량 (CONSULTATION_REQUEST_WEIGHT)
  transportFee?: number | null; // 운송비
  // 선입금 설정 (판매 전체 기준)
  advancePaymentRatio?: number | null; // 선입금 비율 (%)
  advancePaymentAmount?: number | null; // 선입금 금액 (직접 입력)
  /** 등록 유형: 예약 등록 / 판매 등록 (create 시 어떤 버튼으로 제출했는지) */
  registerAs?: 'RESERVED' | 'SALE';
  /** 하차지로 고객 배송지를 고른 경우 API에 전달 → 해당 배송지 행 갱신 */
  unloadingDeliveryAddressId?: string | null;
  /** 판매 비고 (운송관리에서도 표시 예정, API 연동 전 UI) */
  notes?: string | null;
}

function resolveSalesCustomerDefaultLine(data: {
  customerAddress?: string;
  customerAddressRoad?: string;
  customerAddressJibun?: string;
  customerAddressDefaultType?: string;
}): string {
  return formatCustomerListDefaultAddress({
    address: data.customerAddress ?? '',
    addressRoad: data.customerAddressRoad ?? '',
    addressJibun: data.customerAddressJibun ?? '',
    addressDefaultType: data.customerAddressDefaultType ?? '',
  } as Customer);
}

function resolveUnloadingLineFromParts(data: {
  unloadingAddressRoad?: string;
  unloadingAddressJibun?: string;
  unloadingAddressDefaultType?: string;
}): string {
  return formatCustomerListDefaultAddress({
    address: '',
    addressRoad: data.unloadingAddressRoad ?? '',
    addressJibun: data.unloadingAddressJibun ?? '',
    addressDefaultType: data.unloadingAddressDefaultType ?? '',
  } as Customer);
}

function savedDeliveryAddressLabel(row: CustomerDeliveryAddress): string {
  const title = row.label?.trim() || '배송지';
  const line = formatCustomerListDefaultAddress({
    id: row.customerId,
    region: '',
    address: '',
    addressDetail: '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: row.addressRoad,
    addressJibun: row.addressJibun,
    addressDefaultType: row.addressDefaultType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Customer);
  const bits = [row.postalCode?.trim(), line].filter((s) => (s || '').trim().length > 0);
  return bits.length > 0 ? `${title} · ${bits.join(' ')}` : `${title} · 주소 없음`;
}

/** 납품지: 고객 대표 주소 (통합 선택의 기본값) */
const UNLOADING_CHOICE_CUSTOMER_DEFAULT = '__customer_default__';
/** 수정·확정: DB 스냅샷이 대표/배송지 목록과 일치하지 않을 때 */
const UNLOADING_CHOICE_SALE_SNAPSHOT = '__sale_snapshot__';

type EditSaleUnloadingSnapshot = Pick<
  SalesFormData,
  | 'unloadingPostalCode'
  | 'unloadingAddress'
  | 'unloadingAddressRoad'
  | 'unloadingAddressJibun'
  | 'unloadingLegalBCode'
  | 'unloadingAddressDefaultType'
  | 'unloadingAddressDetail'
  | 'unloadingRegion'
  | 'unloadingCity'
>;

function applyEditSaleUnloadingSnapshot(
  snap: EditSaleUnloadingSnapshot,
  setValue: UseFormSetValue<SalesFormData>,
) {
  const o = { shouldDirty: true, shouldValidate: true } as const;
  setValue('unloadingPostalCode', snap.unloadingPostalCode ?? '', o);
  setValue('unloadingAddress', snap.unloadingAddress ?? '', o);
  setValue('unloadingAddressRoad', snap.unloadingAddressRoad ?? '', o);
  setValue('unloadingAddressJibun', snap.unloadingAddressJibun ?? '', o);
  setValue('unloadingLegalBCode', snap.unloadingLegalBCode ?? '', o);
  setValue('unloadingAddressDefaultType', snap.unloadingAddressDefaultType ?? '', o);
  setValue('unloadingAddressDetail', snap.unloadingAddressDetail ?? '', o);
  setValue('unloadingRegion', snap.unloadingRegion ?? '', o);
  setValue('unloadingCity', snap.unloadingCity ?? '', o);
}

/** 우편·도로명·지번·법정동·표기구분·통합 한 줄은 일치하고, 상세만 다를 수 있음 */
function customerAndUnloadingCoreAddressAligned(d: SalesFormData): boolean {
  if (
    (d.customerPostalCode || '').trim() !== (d.unloadingPostalCode || '').trim() ||
    (d.customerAddressRoad || '').trim() !== (d.unloadingAddressRoad || '').trim() ||
    (d.customerAddressJibun || '').trim() !== (d.unloadingAddressJibun || '').trim()
  ) {
    return false;
  }
  const cLegal = (d.customerLegalBCode || '').replace(/\D/g, '').slice(0, 10);
  const uLegal = (d.unloadingLegalBCode || '').replace(/\D/g, '').slice(0, 10);
  if (cLegal !== uLegal) return false;
  if ((d.customerAddressDefaultType || '').trim() !== (d.unloadingAddressDefaultType || '').trim()) {
    return false;
  }
  const cMain = resolveSalesCustomerDefaultLine({
    customerAddress: d.customerAddress,
    customerAddressRoad: d.customerAddressRoad,
    customerAddressJibun: d.customerAddressJibun,
    customerAddressDefaultType: d.customerAddressDefaultType,
  }).trim();
  const uMain =
    resolveUnloadingLineFromParts({
      unloadingAddressRoad: d.unloadingAddressRoad,
      unloadingAddressJibun: d.unloadingAddressJibun,
      unloadingAddressDefaultType: d.unloadingAddressDefaultType,
    }).trim() || (d.unloadingAddress || '').trim();
  return compactAddrCompareKey(cMain) === compactAddrCompareKey(uMain);
}

function onlyDetailDiffersBetweenCustomerAndUnloading(data: SalesFormData): boolean {
  if (!customerAndUnloadingCoreAddressAligned(data)) return false;
  return (data.addressDetail ?? '').trim() !== (data.unloadingAddressDetail ?? '').trim();
}

function unloadingMatchesCustomerDefault(u: SalesFormData): boolean {
  if (!customerAndUnloadingCoreAddressAligned(u)) return false;
  return (u.unloadingAddressDetail || '').trim() === (u.addressDetail || '').trim();
}

function snapAddressFromUnloadingForUpsertCompare(data: SalesFormData): CustomerUpsertFieldSnap {
  const base = pickCustomerUpsertFields(data);
  const road = (data.unloadingAddressRoad ?? '').trim();
  const jibun = (data.unloadingAddressJibun ?? '').trim();
  const udt = (data.unloadingAddressDefaultType ?? '').trim();
  const line =
    (data.unloadingAddress ?? '').trim() ||
    resolveUnloadingLineFromParts({
      unloadingAddressRoad: road,
      unloadingAddressJibun: jibun,
      unloadingAddressDefaultType: udt,
    });
  return {
    ...base,
    customerPostalCode: (data.unloadingPostalCode ?? '').trim(),
    customerAddress: line,
    customerAddressRoad: road,
    customerAddressJibun: jibun,
    customerLegalBCode: (data.unloadingLegalBCode ?? '').replace(/\D/g, '').slice(0, 10),
    customerAddressDefaultType: udt,
    addressDetail: (data.unloadingAddressDetail ?? '').trim(),
    region: (data.unloadingRegion ?? '').trim(),
    customerCity: (data.unloadingCity ?? '').trim(),
  };
}

/** 기준 스냅샷 대비 주소 묶음이 얼마나 달라졌는지(작을수록 덜 변함) */
function addressChangeDistanceToBaseline(
  snap: CustomerUpsertFieldSnap,
  baseline: CustomerUpsertFieldSnap,
): number {
  let d = 0;
  if ((snap.customerPostalCode || '').trim() !== (baseline.customerPostalCode || '').trim()) d++;
  if ((snap.customerLegalBCode || '').trim() !== (baseline.customerLegalBCode || '').trim()) d++;
  if ((snap.addressDetail || '').trim() !== (baseline.addressDetail || '').trim()) d++;
  if ((snap.customerAddressDefaultType || '').trim() !== (baseline.customerAddressDefaultType || '').trim()) {
    d++;
  }
  if (
    compactAddrCompareKey(mainCustomerLineForUpsertDiff(snap)) !==
    compactAddrCompareKey(mainCustomerLineForUpsertDiff(baseline))
  ) {
    d++;
  }
  return d;
}

/** 하차지 → 고객 대표 필드 (하차지가 기준일 때) */
function applyUnloadingAddressToCustomerFields(data: SalesFormData): SalesFormData {
  const up = (data.unloadingPostalCode || '').trim();
  const road = (data.unloadingAddressRoad || '').trim();
  const jibun = (data.unloadingAddressJibun || '').trim();
  const ud = (data.unloadingAddressDetail || '').trim();
  const ur = (data.unloadingRegion || '').trim();
  const uc = (data.unloadingCity || '').trim();
  const ub = (data.unloadingLegalBCode || '').trim();
  const udt = (data.unloadingAddressDefaultType || '').trim();
  const line =
    (data.unloadingAddress || '').trim() ||
    resolveUnloadingLineFromParts({
      unloadingAddressRoad: road,
      unloadingAddressJibun: jibun,
      unloadingAddressDefaultType: udt,
    });
  return {
    ...data,
    customerPostalCode: up || data.customerPostalCode,
    customerAddressRoad: road || data.customerAddressRoad,
    customerAddressJibun: jibun || data.customerAddressJibun,
    customerLegalBCode: ub || data.customerLegalBCode,
    customerAddressDefaultType: udt || data.customerAddressDefaultType,
    customerAddress: jibun || road || data.customerAddress,
    addressDetail: ud || data.addressDetail,
    region: ur || data.region,
    customerCity: uc || data.customerCity,
    unloadingAddress: line || data.unloadingAddress,
  };
}

/** 고객 대표 주소 → 하차지 (고객 쪽만 고친 경우 등) */
function applyCustomerAddressToUnloadingFields(data: SalesFormData): SalesFormData {
  const cp = (data.customerPostalCode || '').trim();
  const road = (data.customerAddressRoad || '').trim();
  const jibun = (data.customerAddressJibun || '').trim();
  const ad = (data.addressDetail || '').trim();
  const reg = (data.region || '').trim();
  const city = (data.customerCity || '').trim();
  const lb = (data.customerLegalBCode || '').trim();
  const udt = (data.customerAddressDefaultType || '').trim();
  const custLine =
    (data.customerAddress || '').trim() ||
    resolveSalesCustomerDefaultLine({
      customerAddress: data.customerAddress,
      customerAddressRoad: data.customerAddressRoad,
      customerAddressJibun: data.customerAddressJibun,
      customerAddressDefaultType: data.customerAddressDefaultType,
    });
  return {
    ...data,
    unloadingPostalCode: cp || data.unloadingPostalCode,
    unloadingAddressRoad: road || data.unloadingAddressRoad,
    unloadingAddressJibun: jibun || data.unloadingAddressJibun,
    unloadingLegalBCode: lb || data.unloadingLegalBCode,
    unloadingAddressDefaultType: udt || data.unloadingAddressDefaultType,
    unloadingAddress: custLine || data.unloadingAddress,
    unloadingAddressDetail: ad || data.unloadingAddressDetail,
    unloadingRegion: reg || data.unloadingRegion,
    unloadingCity: city || data.unloadingCity,
  };
}

/**
 * 하차지 Select가 고객 대표 주소일 때 제출 직전 고객·하차지 정렬.
 * - 상세만 고객에서 바꾼 경우: 하차지 상세만 고객에 맞춤(덮어쓰기 방지).
 * - 고객·하차지 동일: 하차지 → 고객(기존).
 * - 불일치: 로드 시점 스냅샷과의 거리로 어느 쪽을 편집했는지 추정.
 */
function mergeCustomerDefaultFromUnloadingForCreate(
  data: SalesFormData,
  unloadingChoice: string,
  customerBaselineSnap: CustomerUpsertFieldSnap | null = null,
): SalesFormData {
  if (unloadingChoice !== UNLOADING_CHOICE_CUSTOMER_DEFAULT) return data;

  if (onlyDetailDiffersBetweenCustomerAndUnloading(data)) {
    const ad = (data.addressDetail ?? '').trim();
    return { ...data, unloadingAddressDetail: ad };
  }

  if (unloadingMatchesCustomerDefault(data)) {
    return applyUnloadingAddressToCustomerFields(data);
  }

  if (customerBaselineSnap) {
    const nextCust = pickCustomerUpsertFields(data);
    const unloadAs = snapAddressFromUnloadingForUpsertCompare(data);
    const distC = addressChangeDistanceToBaseline(nextCust, customerBaselineSnap);
    const distU = addressChangeDistanceToBaseline(unloadAs, customerBaselineSnap);
    // 고객만 우편/검색으로 바꾼 경우: distC만 큼 → 고객→하차지 동기화. 하차지만 바꾼 경우: distU만 큼.
    if (distC > distU) {
      return applyCustomerAddressToUnloadingFields(data);
    }
  }

  return applyUnloadingAddressToCustomerFields(data);
}

/** 백엔드 upsertCustomer에 반영되는 필드만 비교 (주소·우편·지역 포함) */
type CustomerUpsertFieldSnap = {
  phone: string;
  companyName: string;
  ceo: string;
  region: string;
  customerPostalCode: string;
  customerAddress: string;
  customerAddressRoad: string;
  customerAddressJibun: string;
  customerLegalBCode: string;
  customerAddressDefaultType: string;
  customerCity: string;
  addressDetail: string;
};

type CustomerUpsertBaseline = {
  customerId: string;
  snap: CustomerUpsertFieldSnap;
};

function pickCustomerUpsertFields(d: SalesFormData): CustomerUpsertFieldSnap {
  return {
    phone: (d.phone ?? '').trim(),
    companyName: (d.companyName ?? '').trim(),
    ceo: (d.ceo ?? '').trim(),
    region: (d.region ?? '').trim(),
    customerPostalCode: (d.customerPostalCode ?? '').trim(),
    customerAddress: (d.customerAddress ?? '').trim(),
    customerAddressRoad: (d.customerAddressRoad ?? '').trim(),
    customerAddressJibun: (d.customerAddressJibun ?? '').trim(),
    customerLegalBCode: (d.customerLegalBCode ?? '').replace(/\D/g, '').slice(0, 10),
    customerAddressDefaultType: (d.customerAddressDefaultType ?? '').trim(),
    customerCity: (d.customerCity ?? '').trim(),
    addressDetail: (d.addressDetail ?? '').trim(),
  };
}

const CUSTOMER_UPSERT_FIELD_LABELS: Record<keyof CustomerUpsertFieldSnap, string> = {
  phone: '전화번호',
  companyName: '업체명',
  ceo: '대표자',
  region: '지역',
  customerPostalCode: '우편번호',
  customerAddress: '주소(한 줄)',
  customerAddressRoad: '도로명주소',
  customerAddressJibun: '지번주소',
  customerLegalBCode: '법정동코드',
  customerAddressDefaultType: '주소 표기 구분',
  customerCity: '시·군·구',
  addressDetail: '상세주소',
};

/** 도로명/지번/레거시 한 줄/표기구분은 각각 비교하면 merge·동기화로만 달라져 오탐됨 → 목록과 동일한 ‘한 줄’로 동치 판별 */
const CUSTOMER_ADDRESS_SHAPE_KEYS = new Set<keyof CustomerUpsertFieldSnap>([
  'customerAddress',
  'customerAddressRoad',
  'customerAddressJibun',
  'customerAddressDefaultType',
]);

/** 지역·시군구는 법정동 코드로 대체하는 흐름 — 확인 팝업에서는 제외 */
const CUSTOMER_UPSERT_SKIP_SCALAR_DIFF = new Set<keyof CustomerUpsertFieldSnap>(['region', 'customerCity']);

function mainCustomerLineForUpsertDiff(snap: CustomerUpsertFieldSnap): string {
  return resolveSalesCustomerDefaultLine({
    customerAddress: snap.customerAddress,
    customerAddressRoad: snap.customerAddressRoad,
    customerAddressJibun: snap.customerAddressJibun,
    customerAddressDefaultType: snap.customerAddressDefaultType,
  })
    .replace(/\s+/g, ' ')
    .trim();
}

function compactAddrCompareKey(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

type CustomerUpsertDiffRow = {
  key: keyof CustomerUpsertFieldSnap | 'mainAddressLine';
  label: string;
  before: string;
  after: string;
};

function diffCustomerUpsertFields(
  baseline: CustomerUpsertFieldSnap,
  next: CustomerUpsertFieldSnap,
): CustomerUpsertDiffRow[] {
  const baseMain = mainCustomerLineForUpsertDiff(baseline);
  const nextMain = mainCustomerLineForUpsertDiff(next);
  const addressShapeEqual = compactAddrCompareKey(baseMain) === compactAddrCompareKey(nextMain);

  const keys = Object.keys(baseline) as (keyof CustomerUpsertFieldSnap)[];
  const out: CustomerUpsertDiffRow[] = [];

  for (const key of keys) {
    if (CUSTOMER_ADDRESS_SHAPE_KEYS.has(key)) {
      continue;
    }
    if (CUSTOMER_UPSERT_SKIP_SCALAR_DIFF.has(key)) {
      continue;
    }
    if (baseline[key] !== next[key]) {
      out.push({
        key,
        label: CUSTOMER_UPSERT_FIELD_LABELS[key],
        before: baseline[key] || '(비어 있음)',
        after: next[key] || '(비어 있음)',
      });
    }
  }

  if (!addressShapeEqual) {
    out.push({
      key: 'mainAddressLine',
      label: '기본 주소(도로명·지번·한 줄 통합)',
      before: baseMain || '(비어 있음)',
      after: nextMain || '(비어 있음)',
    });
  }

  return out;
}

type UnloadingDiffSnap = {
  postal: string;
  road: string;
  jibun: string;
  detail: string;
  legal: string;
  defaultType: string;
  region: string;
  city: string;
  oneLine: string;
};

type DeliverySaveDiffRow = { key: string; label: string; before: string; after: string };

function pickUnloadingSnapForDiff(d: SalesFormData): UnloadingDiffSnap {
  const road = (d.unloadingAddressRoad ?? '').trim();
  const jibun = (d.unloadingAddressJibun ?? '').trim();
  const udt = (d.unloadingAddressDefaultType ?? '').trim();
  const oneLineRaw =
    (d.unloadingAddress ?? '').trim() ||
    resolveUnloadingLineFromParts({
      unloadingAddressRoad: road,
      unloadingAddressJibun: jibun,
      unloadingAddressDefaultType: udt,
    });
  return {
    postal: (d.unloadingPostalCode ?? '').trim(),
    road,
    jibun,
    detail: (d.unloadingAddressDetail ?? '').trim(),
    legal: (d.unloadingLegalBCode ?? '').replace(/\D/g, '').slice(0, 10),
    defaultType: udt,
    region: (d.unloadingRegion ?? '').trim(),
    city: (d.unloadingCity ?? '').trim(),
    oneLine: oneLineRaw.replace(/\s+/g, ' ').trim(),
  };
}

function editSaleUnloadingSnapshotToDiffSnap(s: EditSaleUnloadingSnapshot): UnloadingDiffSnap {
  const road = (s.unloadingAddressRoad ?? '').trim();
  const jibun = (s.unloadingAddressJibun ?? '').trim();
  const udt = (s.unloadingAddressDefaultType ?? '').trim();
  const oneLineRaw =
    (s.unloadingAddress ?? '').trim() ||
    resolveUnloadingLineFromParts({
      unloadingAddressRoad: road,
      unloadingAddressJibun: jibun,
      unloadingAddressDefaultType: udt,
    });
  return {
    postal: (s.unloadingPostalCode ?? '').trim(),
    road,
    jibun,
    detail: (s.unloadingAddressDetail ?? '').trim(),
    legal: (s.unloadingLegalBCode ?? '').replace(/\D/g, '').slice(0, 10),
    defaultType: udt,
    region: (s.unloadingRegion ?? '').trim(),
    city: (s.unloadingCity ?? '').trim(),
    oneLine: oneLineRaw.replace(/\s+/g, ' ').trim(),
  };
}

function isSavedDeliveryAddressChoice(
  choice: string,
  rows: CustomerDeliveryAddress[],
): choice is string {
  return (
    choice !== UNLOADING_CHOICE_CUSTOMER_DEFAULT &&
    choice !== UNLOADING_CHOICE_SALE_SNAPSHOT &&
    rows.some((a) => a.id === choice)
  );
}

/** 판매 저장 API에 넣을 배송지 id. Select 값이 저장 배송지 id면 전송(목록 쿼리가 비어 있거나 순간 불일치여도 state id는 유효할 수 있음 → 서버에서 소유·활성 검증). */
function unloadingDeliveryAddressIdForApiPayload(choice: string): string | null {
  const t = (choice ?? '').trim();
  if (!t) return null;
  if (t === UNLOADING_CHOICE_CUSTOMER_DEFAULT || t === UNLOADING_CHOICE_SALE_SNAPSHOT) return null;
  return t;
}

function diffSelectedDeliveryUnloading(
  baseline: UnloadingDiffSnap,
  next: UnloadingDiffSnap,
): DeliverySaveDiffRow[] {
  const shapeEqual = compactAddrCompareKey(baseline.oneLine) === compactAddrCompareKey(next.oneLine);
  const labels: Record<keyof UnloadingDiffSnap, string> = {
    postal: '하차지·선택 배송지 우편번호',
    road: '하차지 도로명',
    jibun: '하차지 지번',
    detail: '하차지 상세주소',
    legal: '하차지 법정동코드',
    defaultType: '하차지 주소 표기 구분',
    region: '하차지 지역',
    city: '하차지 시·군·구',
    oneLine: '하차지 주소(도로명·지번·한 줄 통합)',
  };
  const scalarKeys: (keyof UnloadingDiffSnap)[] = ['postal', 'detail', 'legal'];
  const out: DeliverySaveDiffRow[] = [];
  for (const k of scalarKeys) {
    if (baseline[k] !== next[k]) {
      out.push({
        key: `unl.${String(k)}`,
        label: labels[k],
        before: baseline[k] || '(비어 있음)',
        after: next[k] || '(비어 있음)',
      });
    }
  }
  if (!shapeEqual) {
    out.push({
      key: 'unl.mainLine',
      label: labels.oneLine,
      before: baseline.oneLine || '(비어 있음)',
      after: next.oneLine || '(비어 있음)',
    });
  }
  return out;
}

function deliveryRowMatchesUnloading(
  row: CustomerDeliveryAddress,
  postal: string | undefined,
  line: string | undefined,
  detail: string | undefined,
): boolean {
  const pseudo = {
    id: row.customerId,
    region: '',
    address: '',
    addressDetail: row.addressDetail ?? '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: row.addressRoad,
    addressJibun: row.addressJibun,
    addressDefaultType: row.addressDefaultType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Customer;
  const resolvedLine = formatCustomerListDefaultAddress(pseudo);
  return (
    (postal || '').trim() === (row.postalCode || '').trim() &&
    (line || '').trim() === (resolvedLine || '').trim() &&
    (detail || '').trim() === (row.addressDetail || '').trim()
  );
}

function applyUnloadingFromSavedDeliveryAddress(
  row: CustomerDeliveryAddress,
  setValue: UseFormSetValue<SalesFormData>,
) {
  const road = row.addressRoad?.trim() || '';
  const jibun = row.addressJibun?.trim() || '';
  const udt = row.addressDefaultType === 'JIBUN' ? 'JIBUN' : 'ROAD';
  const pseudo = {
    id: row.customerId,
    region: '',
    address: '',
    addressDetail: row.addressDetail ?? '',
    companyName: '',
    ceo: '',
    phone: '',
    chamchamStatus: '',
    addressRoad: row.addressRoad,
    addressJibun: row.addressJibun,
    addressDefaultType: row.addressDefaultType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Customer;
  const line = formatCustomerListDefaultAddress(pseudo);
  const bcode = (row.legalBCode ?? '').replace(/\D/g, '').slice(0, 10);
  setValue('unloadingPostalCode', row.postalCode?.trim() || '', { shouldDirty: true });
  setValue('unloadingAddressRoad', road, { shouldDirty: true });
  setValue('unloadingAddressJibun', jibun, { shouldDirty: true });
  setValue('unloadingAddressDefaultType', udt, { shouldDirty: true });
  setValue('unloadingLegalBCode', bcode, { shouldDirty: true });
  setValue('unloadingAddress', line || '', { shouldDirty: true });
  setValue('unloadingAddressDetail', row.addressDetail?.trim() || '', { shouldDirty: true });
  setValue('unloadingRegion', '', { shouldDirty: true });
  setValue('unloadingCity', '', { shouldDirty: true });
}

interface SalesFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit' | 'confirm';
  salesId?: string | null;
  onSubmit?: (data: SalesFormData) => Promise<void>;
  isSubmitting?: boolean;
  initialData?: Partial<SalesFormData>; // 복사하여 등록 시 초기값
  /** 신규 판매관리만 'bl'. 기본 container = 기존 /sales 동작 */
  productLineKey?: 'container' | 'bl';
}

const defaultValues: SalesFormData = {
  customerId: null,
  phone: '',
  companyName: '',
  ceo: '',
  region: '',
  customerPostalCode: '',
  customerAddress: '',
  customerAddressRoad: '',
  customerAddressJibun: '',
  customerLegalBCode: '',
  customerAddressDefaultType: '',
  customerCity: '',
  addressDetail: '',
  unloadingPostalCode: '',
  unloadingAddress: '',
  unloadingAddressRoad: '',
  unloadingAddressJibun: '',
  unloadingLegalBCode: '',
  unloadingAddressDefaultType: '',
  unloadingAddressDetail: '',
  unloadingRegion: '',
  unloadingCity: '',
  productId: '',
  productName: '',
  selectedContainers: [],
  reservationDate: '',
  salesDate: '',
  requestVehicle: null,
  transportFee: null,
  unloadingDeliveryAddressId: null,
  notes: '',
};

export function SalesFormDrawer({
  open,
  onOpenChange,
  mode,
  salesId,
  onSubmit,
  isSubmitting: externalIsSubmitting,
  initialData,
  productLineKey = 'container',
}: SalesFormDrawerProps) {
  const useBlProductLine = productLineKey === 'bl';
  const isMobile = useIsMobile();
  const [isClient, setIsClient] = React.useState(false);
  const [customerAddressModalOpen, setCustomerAddressModalOpen] = React.useState(false);
  const customerAddressContentRef = React.useRef<HTMLDivElement>(null);
  const [unloadingAddressModalOpen, setUnloadingAddressModalOpen] = React.useState(false);
  const unloadingAddressContentRef = React.useRef<HTMLDivElement>(null);
  const [sameAsCustomerAddress, setSameAsCustomerAddress] = React.useState(true);
  /** 등록: 납품지 — 고객 대표 주소(UNLOADING_CHOICE_CUSTOMER_DEFAULT) 또는 배송지 id */
  const [unloadingAddressChoice, setUnloadingAddressChoice] = React.useState<string>(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
  const unloadingAddressChoiceRef = React.useRef(unloadingAddressChoice);
  React.useEffect(() => {
    unloadingAddressChoiceRef.current = unloadingAddressChoice;
  }, [unloadingAddressChoice]);
  const savedDeliveryAddressesRef = React.useRef<CustomerDeliveryAddress[]>([]);
  const [addDeliveryAddressDialogOpen, setAddDeliveryAddressDialogOpen] = React.useState(false);
  const initialDeliveryCopyMatchRef = React.useRef(false);

  const [transportFeeSearchOpen, setTransportFeeSearchOpen] = React.useState(false);
  /** 등록 모드: 예약으로 등록 vs 판매로 등록 (create 모드에서 어떤 버튼으로 제출했는지) */
  const registerModeRef = React.useRef<'RESERVED' | 'SALE' | null>(null);
  /** create 모드에서 initialData 적용은 드로어가 열릴 때 한 번만 수행 (등록 실패 후 리렌더 시 사용자 입력 유지) */
  const createInitialDataAppliedRef = React.useRef(false);
  /** 수정·확정: 판매별 하차지 Select(대표/배송지/스냅샷) 초기 동기화 1회 */
  const editUnloadingChoiceSyncRef = React.useRef<string | null>(null);
  /** 수정·확정: 상세 로드 시점의 하차지(DB). '이 판매에 저장된 주소' 재선택 시 복원 */
  const editSaleUnloadingSnapshotRef = React.useRef<EditSaleUnloadingSnapshot | null>(null);
  /** 고객 카드(upsert) 기준 스냅샷 — 변경 시 확인 다이얼로그용 */
  const customerUpsertBaselineRef = React.useRef<CustomerUpsertBaseline | null>(null);
  const pendingSubmitAfterCustomerConfirmRef = React.useRef<SalesFormData | null>(null);
  const [customerUpsertConfirmOpen, setCustomerUpsertConfirmOpen] = React.useState(false);
  const [customerUpsertDiffs, setCustomerUpsertDiffs] = React.useState<CustomerUpsertDiffRow[]>([]);
  const [customerUpsertConfirmBusy, setCustomerUpsertConfirmBusy] = React.useState(false);
  /** 배송지 선택 직후 하차지 스냅샷 — 선택 배송지 주소 변경 확인용 */
  const deliveryUnloadingBaselineRef = React.useRef<{
    deliveryId: string;
    snap: UnloadingDiffSnap;
  } | null>(null);
  const [deliverySaveConfirmDiffs, setDeliverySaveConfirmDiffs] = React.useState<DeliverySaveDiffRow[]>([]);
  /** 수정·확정: 로드 시점 판매 하차지 vs 저장 직전(merge 반영) — SNAPSHOT 모드에서 고객 diff가 비어도 표시 */
  const [saleUnloadingConfirmDiffs, setSaleUnloadingConfirmDiffs] = React.useState<DeliverySaveDiffRow[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting: formIsSubmitting },
  } = useForm<SalesFormData>({
    defaultValues,
  });

  const refreshCustomerUpsertBaseline = React.useCallback(() => {
    const v = getValues();
    const cid = v.customerId;
    if (!cid) {
      customerUpsertBaselineRef.current = null;
      return;
    }
    customerUpsertBaselineRef.current = {
      customerId: cid,
      snap: pickCustomerUpsertFields(v),
    };
  }, [getValues]);

  const markUnloadingManualEdit = React.useCallback(() => {
    if (mode === 'create') {
      if (unloadingAddressChoiceRef.current !== UNLOADING_CHOICE_CUSTOMER_DEFAULT) return;
      setSameAsCustomerAddress(false);
      return;
    }
    if (mode === 'edit' || mode === 'confirm') {
      const cur = unloadingAddressChoiceRef.current;
      // 저장 배송지 선택: 해당 id 유지
      if (isSavedDeliveryAddressChoice(cur, savedDeliveryAddressesRef.current)) {
        setSameAsCustomerAddress(false);
        return;
      }
      // 고객 대표 주소 선택: 하차지(상세·검색 등)만 수정해도 Select 유지 → 저장 시 merge로 대표 주소 반영
      if (cur === UNLOADING_CHOICE_CUSTOMER_DEFAULT) {
        setSameAsCustomerAddress(false);
        return;
      }
      // 그 외(이미 '이 판매에 저장된 주소' 등): 수동 편집 시 스냅샷 유지
      setUnloadingAddressChoice(UNLOADING_CHOICE_SALE_SNAPSHOT);
      setSameAsCustomerAddress(false);
    }
  }, [mode]);

  const registerUnloadingWithMark = React.useCallback(
    (
      name:
        | 'unloadingPostalCode'
        | 'unloadingAddress'
        | 'unloadingAddressDetail'
        | 'unloadingAddressRoad'
        | 'unloadingAddressJibun',
    ) => {
      const r = register(name);
      return {
        ...r,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          void r.onChange(e);
          markUnloadingManualEdit();
        },
      };
    },
    [register, markUnloadingManualEdit],
  );

  // edit 또는 confirm 모드일 때 기존 데이터 불러오기
  const { data: salesDetail, isLoading: isSalesDetailLoading } = useSalesDetail(
    (mode === 'edit' || mode === 'confirm') ? salesId ?? undefined : undefined
  );
  const updateSalesMutation = useUpdateSales();
  const confirmSalesMutation = useConfirmSales();

  // 외부에서 전달된 isSubmitting이 있으면 우선 사용, 없으면 form의 isSubmitting 또는 mutation의 isPending 사용
  const isSubmitting = externalIsSubmitting ?? (
    mode === 'edit' ? updateSalesMutation.isPending 
    : mode === 'confirm' ? confirmSalesMutation.isPending 
    : formIsSubmitting
  );

  // edit 모드일 때 기존 데이터를 폼에 채우기
  // 고객 수정처럼 regions가 로드된 후에 처리
  React.useEffect(() => {
    if (!open) {
      createInitialDataAppliedRef.current = false;
      editSaleUnloadingSnapshotRef.current = null;
      return;
    }
    if ((mode === 'edit' || mode === 'confirm') && salesDetail) {
      // 디버깅: 가져온 데이터 출력
      console.log('=== 판매 수정 데이터 ===');
      console.log('전체 salesDetail:', salesDetail);
      console.log('요청 차량 (requestVehicle):', salesDetail.requestVehicle);
      console.log('운송비 (transportFee):', salesDetail.transportFee);
      console.log('고객 지역 (customerRegion):', salesDetail.customerRegion);
      console.log('고객 시/군/구 (customerCity):', salesDetail.customerCity);
      console.log('고객 주소 (customerAddress):', salesDetail.customerAddress);
      console.log('고객 우편번호 (customerPostalCode):', salesDetail.customerPostalCode);
      console.log('고객 상세주소 (customerAddressDetail):', salesDetail.customerAddressDetail);
      console.log('제품 정보 (productInfo):', salesDetail.productInfo);
      if (salesDetail.productInfo && salesDetail.productInfo.length > 0) {
        salesDetail.productInfo.forEach((product, index) => {
          console.log(`제품 ${index + 1}:`, {
            itemId: product.itemId,
            containerId: product.containerId,
            containerNo: product.containerNo,
            inboundStatus: product.inboundStatus,
            containerType: product.containerType,
            cargoBales: product.cargoBales,
            cargoWeight: product.cargoWeight,
          });
        });
      }
      console.log('========================');

      const legacyUnloadingLine = (salesDetail.unloadingAddress ?? '').trim();
      const apiRoad = (salesDetail.unloadingAddressRoad ?? '').trim();
      const apiJibun = (salesDetail.unloadingAddressJibun ?? '').trim();
      /** 상세 API에 도로명·지번이 없고 레거시 한 줄만 있을 때 도로명 칸에 표시 */
      const unloadingRoadForForm =
        apiRoad || (apiJibun ? '' : legacyUnloadingLine);
      const unloadingJibunForForm = apiJibun;

      const inferredUnloadingDefaultType = (() => {
        const k = resolveDefaultAddressKind({
          address: salesDetail.unloadingAddress ?? '',
          addressRoad: unloadingRoadForForm,
          addressJibun: unloadingJibunForForm,
          addressDefaultType: '',
        } as Customer);
        if (k === 'ROAD') return 'ROAD';
        if (k === 'JIBUN') return 'JIBUN';
        return '';
      })();

      const formData: SalesFormData = {
        customerId: salesDetail.customerId ?? null,
        phone: salesDetail.customerPhone ?? '',
        companyName: salesDetail.customerName ?? '',
        ceo: salesDetail.customerCeo ?? '',
        region: salesDetail.customerRegion ?? '',
        customerPostalCode: salesDetail.customerPostalCode ?? '',
        customerAddress: salesDetail.customerAddress ?? '',
        customerAddressRoad: salesDetail.customerAddressRoad ?? '',
        customerAddressJibun: salesDetail.customerAddressJibun ?? '',
        customerLegalBCode: salesDetail.customerLegalBCode ?? '',
        customerAddressDefaultType: salesDetail.customerAddressDefaultType ?? '',
        customerCity: salesDetail.customerCity ?? '', // 고객 수정처럼 직접 설정
        addressDetail: salesDetail.customerAddressDetail ?? '',
        unloadingPostalCode: salesDetail.unloadingPostalCode ?? '',
        unloadingAddress: salesDetail.unloadingAddress ?? '',
        unloadingAddressRoad: unloadingRoadForForm,
        unloadingAddressJibun: unloadingJibunForForm,
        unloadingLegalBCode: salesDetail.unloadingLegalBCode ?? '',
        unloadingAddressDefaultType: inferredUnloadingDefaultType,
        unloadingAddressDetail: salesDetail.unloadingAddressDetail ?? '',
        unloadingRegion: salesDetail.unloadingRegion ?? '',
        unloadingCity: salesDetail.unloadingCity ?? '',
        productId: '',
        productName: '',
        selectedContainers: salesDetail.productInfo.map((product) => ({
          id: product.containerId || product.containerNo || '', // 컨테이너 ID 또는 번호 사용
          itemId: product.itemId ?? null, // 판매 항목 ID 추가
          containerId: product.containerId ?? null, // 컨테이너 ID 추가
          containerNo: product.containerNo ?? '',
          orderId: '', // edit 모드에서는 필요 없지만 타입을 위해 빈 문자열
          contractNo: (product as any).contractNo ?? '', // 계약번호 매핑 (타입 단언 사용)
          bl: (product as any).bl ?? null, // BL 번호 매핑
          sequence: product.sequence ?? null, // 컨테이너 순번
          productName: product.productName ?? '', // 제품명
          product: product.productName ?? null, // 제품 코드
          exporterName: (product as any).exporterName ?? null,
          exportCountryName: (product as any).exportCountryName ?? null,
          tradeGrade: product.tradeGrade ?? '',
          tradeGradeName: product.tradeGradeName ?? null,
          salesGrade: product.salesGrade ?? '',
          salesGradeName: product.salesGradeName ?? null,
          packingType: product.packingType ?? '',
          bales: (product.salesBales ?? product.tradeBales ?? product.bales) ?? null,
          salesBales: product.salesBales != null ? Number(product.salesBales) : null,
          tradeBales: product.tradeBales != null ? Number(product.tradeBales) : null,
          // 재고 상세와 일치: API에서 내려준 컨테이너 전체/가용 사용 (없으면 기존 로직)
          availableBales: (product as any).availableBales != null ? Number((product as any).availableBales) : (product.salesBales ?? product.tradeBales ?? product.bales) != null ? Number(product.salesBales ?? product.tradeBales ?? product.bales) : null,
          availableWeight: (product as any).availableWeight != null ? Number((product as any).availableWeight) : null,
          weight: (product as any).containerTotalWeight != null ? Number((product as any).containerTotalWeight) : (product.weight ?? null),
          // 가용/전체 표시용: 판매된 수량 (전체 - 가용)
          soldWeight: (product as any).containerTotalWeight != null && (product as any).availableWeight != null ? Number((product as any).containerTotalWeight) - Number((product as any).availableWeight) : (product as any).soldWeight ?? null,
          soldBales: (product as any).containerTotalBales != null && (product as any).availableBales != null ? Math.round(Number((product as any).containerTotalBales) - Number((product as any).availableBales)) : (product as any).soldBales ?? null,
          unitPrice: null, // edit 모드에서는 필요 없지만 타입을 위해 null
          etaDate: product.etaDate ?? null,
          warehouseId: product.inboundWarehouse ? (typeof product.inboundWarehouse === 'number' ? product.inboundWarehouse : null) : null, // 창고 ID (inboundWarehouse에서 가져옴)
          warehouseName: product.inboundWarehouseName ?? product.inboundWarehouse ?? null, // 창고명 (inboundWarehouseName 우선, 없으면 코드)
          pendingPurchaseCost: product.pendingPurchaseCost?.toString() ?? null, // 예정원가 매핑 (문자열로 변환)
          confirmedPurchaseCost: product.confirmedPurchaseCost?.toString() ?? null, // 확정원가 매핑 (문자열로 변환)
          inboundStatus: product.inboundStatus ?? null, // 입고 상태 매핑
          comparisonExchangeRate: product.exchangeRate ?? null,
          appliedExchangeRate: product.exchangeRate ?? null,
          containerType: product.containerType ?? 'CONTAINER',
          cargoBales: product.cargoBales ?? null, // 카고 베일 매핑
          cargoWeight: product.cargoWeight ?? null, // 카고 중량 매핑
          salesUnitPrice: product.salesUnitPrice ?? null,
          salesUnitPriceStage: product.salesUnitPriceStage ?? null,
          margin: product.margin ?? null,
          salesPrice: product.salesUnitPrice && product.weight
            ? product.salesUnitPrice * product.weight * 1000
            : 0,
          stoCost: product.stoCost ?? 0,
          dtCost: product.dtCost ?? 0,
          workFee: product.workFee ?? 0,
          onsiteWorkFee: product.onsiteWorkFee ?? 0,
          advancePaymentRatio: product.advancePaymentRatio ?? 0,
          status: product.status ?? null, // 판매 항목 상태 추가
        })),
        reservationDate: salesDetail.reservationDate ?? '',
        salesDate: salesDetail.salesDate ?? '',
        requestVehicle: salesDetail.requestVehicle ?? null,
        transportFee: salesDetail.transportFee ?? null,
        advancePaymentRatio: salesDetail.advancePaymentRatio ?? null,
        advancePaymentAmount: salesDetail.advancePaymentAmount ?? null,
        notes: salesDetail.notes?.trim() ?? '',
      };
      // API가 고객·판매 하차지 중 한쪽에만 법정동을 내려줄 때 코어 비교가 어긋나 '이 판매 저장 주소'로만 잡히는 것 방지
      {
        const cLeg = (formData.customerLegalBCode ?? '').replace(/\D/g, '').slice(0, 10);
        const uLeg = (formData.unloadingLegalBCode ?? '').replace(/\D/g, '').slice(0, 10);
        if (!cLeg && uLeg) {
          formData.customerLegalBCode = formData.unloadingLegalBCode;
        } else if (!uLeg && cLeg) {
          formData.unloadingLegalBCode = formData.customerLegalBCode;
        }
      }
      console.log('=== 폼 데이터 설정 ===');
      console.log('requestVehicle:', formData.requestVehicle);
      console.log('transportFee:', formData.transportFee);
      console.log('selectedContainers itemId 확인:', formData.selectedContainers?.map(c => ({ 
        containerId: c.containerId, 
        itemId: c.itemId,
        id: c.id 
      })));
      console.log('salesDetail.productInfo 전체:', JSON.stringify(salesDetail.productInfo, null, 2));
      editSaleUnloadingSnapshotRef.current = {
        unloadingPostalCode: formData.unloadingPostalCode ?? '',
        unloadingAddress: formData.unloadingAddress ?? '',
        unloadingAddressRoad: formData.unloadingAddressRoad ?? '',
        unloadingAddressJibun: formData.unloadingAddressJibun ?? '',
        unloadingLegalBCode: formData.unloadingLegalBCode ?? '',
        unloadingAddressDefaultType: formData.unloadingAddressDefaultType ?? '',
        unloadingAddressDetail: formData.unloadingAddressDetail ?? '',
        unloadingRegion: formData.unloadingRegion ?? '',
        unloadingCity: formData.unloadingCity ?? '',
      };
      reset(formData);
      if (formData.customerId) {
        customerUpsertBaselineRef.current = {
          customerId: formData.customerId,
          snap: pickCustomerUpsertFields(formData),
        };
      } else {
        customerUpsertBaselineRef.current = null;
      }
      // productInfo 반영 후 캐시 초기화 → 다음 렌더에서 각 카드별 올바른 남은(가용+이건) 재계산
      containerRemainingCacheRef.current = {};
      editUnloadingChoiceSyncRef.current = null;

      // reset 후에도 값이 제대로 설정되었는지 확인
      setTimeout(() => {
        console.log('=== reset 후 폼 값 확인 ===');
        console.log('requestVehicle (watch):', watch('requestVehicle'));
        console.log('transportFee (watch):', watch('transportFee'));
      }, 100);
    } else if (mode === 'create') {
      // initialData가 있으면 복사하여 등록 모드. selectedContainers가 있으면 해당 컨테이너로 미리 선택 (입고 확정 상세에서 판매 등록 시)
      // 등록 실패 후 부모 리렌더 시 initialData 참조만 바뀌어도 reset되지 않도록, 드로어가 열릴 때(open 직후) 한 번만 적용
      if (initialData) {
        const shouldApply = !createInitialDataAppliedRef.current;
        if (shouldApply) {
          createInitialDataAppliedRef.current = true;
          const hasPreSelectedContainers = (initialData.selectedContainers?.length ?? 0) > 0;
          const copiedData: SalesFormData = {
            ...defaultValues,
            ...initialData,
            selectedContainers: hasPreSelectedContainers ? initialData.selectedContainers! : [],
            productId: hasPreSelectedContainers ? (initialData.productId ?? '') : '',
            productName: hasPreSelectedContainers ? (initialData.productName ?? '') : '',
          };
          reset(copiedData);

          const hasUnloadingAddress = copiedData.unloadingPostalCode || copiedData.unloadingAddress || copiedData.unloadingAddressDetail || copiedData.unloadingRegion || copiedData.unloadingCity;
          if (hasUnloadingAddress) {
            const resolvedCustomerLine = resolveSalesCustomerDefaultLine({
              customerAddress: copiedData.customerAddress,
              customerAddressRoad: copiedData.customerAddressRoad,
              customerAddressJibun: copiedData.customerAddressJibun,
              customerAddressDefaultType: copiedData.customerAddressDefaultType,
            });
            const isSameAsCustomer =
              copiedData.unloadingPostalCode === copiedData.customerPostalCode &&
              (copiedData.unloadingAddress === resolvedCustomerLine ||
                copiedData.unloadingAddress === (copiedData.customerAddress ?? '').trim()) &&
              copiedData.unloadingAddressDetail === copiedData.addressDetail &&
              copiedData.unloadingRegion === copiedData.region &&
              copiedData.unloadingCity === copiedData.customerCity;
            setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
          } else {
            setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
          }
          window.setTimeout(() => {
            const v = getValues();
            if (v.customerId) {
              customerUpsertBaselineRef.current = {
                customerId: v.customerId,
                snap: pickCustomerUpsertFields(v),
              };
            } else {
              customerUpsertBaselineRef.current = null;
            }
          }, 0);
        }
      } else {
        if (!createInitialDataAppliedRef.current) {
          createInitialDataAppliedRef.current = true;
          reset(defaultValues);
          setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
          window.setTimeout(() => {
            customerUpsertBaselineRef.current = null;
          }, 0);
        }
      }
      setPendingCustomerCity(null);
    }
  }, [open, mode, salesDetail, reset, initialData, getValues]);

  const [pendingCustomerCity, setPendingCustomerCity] = React.useState<string | null>(null);
  const [pendingUnloadingCity, setPendingUnloadingCity] = React.useState<string | null>(null);

  // 업체명 검색 상태
  const [companySearchOpen, setCompanySearchOpen] = React.useState(false);
  const [companySearchTerm, setCompanySearchTerm] = React.useState('');
  const [companySearchResults, setCompanySearchResults] = React.useState<CompanySearchResult[]>([]);
  const [companySearchLoading, setCompanySearchLoading] = React.useState(false);
  const [companySearchError, setCompanySearchError] = React.useState<string | null>(null);
  const [companySearchAttempted, setCompanySearchAttempted] = React.useState(false);

  // 전화번호 검색 상태
  const [phoneSearchOpen, setPhoneSearchOpen] = React.useState(false);
  const [phoneSearchTerm, setPhoneSearchTerm] = React.useState('');
  const [phoneSearchResults, setPhoneSearchResults] = React.useState<CompanySearchResult[]>([]);
  const [phoneSearchLoading, setPhoneSearchLoading] = React.useState(false);
  const [phoneSearchError, setPhoneSearchError] = React.useState<string | null>(null);
  const [phoneSearchAttempted, setPhoneSearchAttempted] = React.useState(false);

  // 클라이언트 사이드 체크
  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // 카카오 주소 검색 스크립트 로드
  React.useEffect(() => {
    if (!open || !isClient || typeof window === 'undefined') return;

    // 이미 스크립트가 로드되어 있는지 확인
    const existingScript = document.querySelector('script[src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"]');
    if (existingScript || window.daum?.Postcode) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // 컴포넌트가 닫힐 때 스크립트를 제거하지 않음 (다른 컴포넌트에서도 사용할 수 있음)
    };
  }, [open, isClient]);

  // 코드 옵션 로드
  const { data: regions } = useRegions();
  const { data: products } = useCodeMastersByGroup('PRODUCT');
  const { data: gradeCodes } = useCodesByCategory('TRADE_GRADE');
  const { data: salesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: salesPriceStageCodes } = useCodeMastersByGroup('SALES_PRICE_STAGE');
  const { data: destinationPortCodes = [] } = useCodesByCategory('DESTINATION_PORT');
  
  // vehicle dispatch 데이터 가져오기 (운송비 평균 계산용)
  const { data: vehicleDispatches = [] } = useVehicleDispatches();

  // 차량 코드 맵 생성
  const requestVehicleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (requestVehicleCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [requestVehicleCodes]);

  // 운송비 검색 팝업 필터링 상태
  const [transportFeeFilterRegion, setTransportFeeFilterRegion] = React.useState<string>('__none__');
  const [transportFeeFilterCity, setTransportFeeFilterCity] = React.useState<string>('__none__');
  const [transportFeeFilterVehicle, setTransportFeeFilterVehicle] = React.useState<string>('__none__');
  
  // 필터링된 지역에 대한 시군구 목록
  const transportFeeFilterRegionId = React.useMemo(() => {
    if (!transportFeeFilterRegion || transportFeeFilterRegion === '__none__') return undefined;
    return regions?.find((r) => r.name === transportFeeFilterRegion)?.id;
  }, [transportFeeFilterRegion, regions]);
  const { data: transportFeeFilterCities } = useCities(transportFeeFilterRegionId);

  // 운송비 데이터 그룹화 및 평균 계산
  const transportFeeStats = React.useMemo(() => {
    const statsMap = new Map<string, {
      region: string;
      city: string;
      requestVehicle: string;
      requestVehicleName: string;
      vehicleCount: number;
      transportFeeSum: number;
      transportFeeCount: number;
      transportFeeAvg: number;
    }>();

    vehicleDispatches.forEach(dispatch => {
      // 운송비가 없는 경우 제외
      if (!dispatch.transportFee || dispatch.transportFee <= 0) return;

      // 지역 정보 가져오기
      const regionName = dispatch.unloadingRegion?.name || '미지정';
      const cityName = dispatch.unloadingCity?.name || '';
      const requestVehicle = dispatch.requestVehicle || '미지정';

      // 키: 지역-시군구-차량
      const key = `${regionName}|${cityName}|${requestVehicle}`;

      // transportFee를 숫자로 변환하고 유효성 검사
      const transportFee = typeof dispatch.transportFee === 'number' 
        ? dispatch.transportFee 
        : (typeof dispatch.transportFee === 'string' 
          ? parseFloat(dispatch.transportFee) 
          : 0);
      
      // 유효하지 않은 숫자인 경우 0으로 처리
      const validTransportFee = (isNaN(transportFee) || !isFinite(transportFee)) ? 0 : transportFee;
      if (validTransportFee <= 0) return;

      const existingStat = statsMap.get(key);

      if (existingStat) {
        existingStat.vehicleCount += 1;
        existingStat.transportFeeSum += validTransportFee;
        existingStat.transportFeeCount += 1;
        // 평균 계산 시 NaN이나 Infinity 체크
        const avg = existingStat.transportFeeSum / existingStat.transportFeeCount;
        existingStat.transportFeeAvg = (isNaN(avg) || !isFinite(avg)) ? 0 : avg;
      } else {
        statsMap.set(key, {
          region: regionName,
          city: cityName,
          requestVehicle,
          requestVehicleName: requestVehicleMap.get(requestVehicle) || requestVehicle,
          vehicleCount: 1,
          transportFeeSum: validTransportFee,
          transportFeeCount: 1,
          transportFeeAvg: validTransportFee,
        });
      }
    });

    // 배열로 변환 및 정렬 (지역, 시군구, 차량순)
    return Array.from(statsMap.values()).sort((a, b) => {
      const regionCompare = a.region.localeCompare(b.region, 'ko');
      if (regionCompare !== 0) return regionCompare;
      
      const cityCompare = a.city.localeCompare(b.city, 'ko');
      if (cityCompare !== 0) return cityCompare;
      
      return a.requestVehicleName.localeCompare(b.requestVehicleName, 'ko');
    });
  }, [vehicleDispatches, requestVehicleMap]);

  // 필터링된 운송비 데이터
  const filteredTransportFeeStats = React.useMemo(() => {
    return transportFeeStats.filter(stat => {
      // 지역 필터
      if (transportFeeFilterRegion !== '__none__' && stat.region !== transportFeeFilterRegion) {
        return false;
      }
      
      // 시군구 필터
      if (transportFeeFilterCity !== '__none__' && stat.city !== transportFeeFilterCity) {
        return false;
      }
      
      // 차량 필터
      if (transportFeeFilterVehicle !== '__none__' && stat.requestVehicle !== transportFeeFilterVehicle) {
        return false;
      }
      
      return true;
    });
  }, [transportFeeStats, transportFeeFilterRegion, transportFeeFilterCity, transportFeeFilterVehicle]);

  // 운송비 선택 핸들러
  const handleSelectTransportFee = React.useCallback((transportFee: number) => {
    setValue('transportFee', transportFee, { shouldDirty: true });
    setTransportFeeSearchOpen(false);
  }, [setValue]);

  // 요청 차량이 컨테이너(40FT 등)일 때만 화물안전운임요금제 검색, 그 외에는 배차 이력 검색
  const isRequestVehicleContainer = React.useCallback((vehicleValue: string | null | undefined) => {
    if (!vehicleValue) return false;
    const s = String(vehicleValue).toLowerCase();
    return /40ft|40\s*ft|컨테이너|container/.test(s);
  }, []);
  const isTransportFeeContainerMode = React.useMemo(() => {
    const requestVehicle = watch('requestVehicle');
    return isRequestVehicleContainer(requestVehicle);
  }, [watch('requestVehicle'), isRequestVehicleContainer]);

  // 판매예약과 동일: 요청 차량 Select 값 (__none__ / 코드 / 레거시 자유입력)
  const requestVehicleRaw = (watch('requestVehicle') ?? '').trim();
  const requestVehicleCodeMatch = (requestVehicleCodes ?? []).some(
    (c) => (c.value || c.name || '').trim() === requestVehicleRaw,
  );
  const requestVehicleSelectValue = !requestVehicleRaw
    ? '__none__'
    : requestVehicleCodeMatch
      ? requestVehicleRaw
      : `__legacy__:${requestVehicleRaw}`;

  // 화물안전운임요금제 검색용 필터 상태 (컨테이너 모드일 때만 사용)
  const [safeFreightFilterRegion, setSafeFreightFilterRegion] = React.useState<string>('__none__');
  const [safeFreightFilterCity, setSafeFreightFilterCity] = React.useState<string>('__none__');
  const [safeFreightFilterTown, setSafeFreightFilterTown] = React.useState<string>('__all__');
  const [safeFreightFilterPort, setSafeFreightFilterPort] = React.useState<string>('__all__');
  const [safeFreightFilterDistance, setSafeFreightFilterDistance] = React.useState<string>('__all__');
  const [safeFreightSurchargeHoliday, setSafeFreightSurchargeHoliday] = React.useState(false);
  const [safeFreightSurchargeLateNight, setSafeFreightSurchargeLateNight] = React.useState(false);
  const { data: safeFreightRegionNames = [] } = useSafeFreightRegionNames();
  const { data: safeFreightCityNames = [] } = useSafeFreightCityNames(
    safeFreightFilterRegion && safeFreightFilterRegion !== '__none__' ? safeFreightFilterRegion : undefined,
  );
  const { data: safeFreightTownNames = [] } = useTownNames(
    safeFreightFilterRegion && safeFreightFilterRegion !== '__none__' ? safeFreightFilterRegion : undefined,
    safeFreightFilterCity && safeFreightFilterCity !== '__none__' ? safeFreightFilterCity : undefined,
  );
  const { data: safeFreightDistanceList = [] } = useDistanceKmList();
  const safeFreightQueryParams = React.useMemo(
    () => ({
      page: 1,
      limit: 100,
      region: safeFreightFilterRegion && safeFreightFilterRegion !== '__none__' ? safeFreightFilterRegion : undefined,
      city: safeFreightFilterCity && safeFreightFilterCity !== '__none__' ? safeFreightFilterCity : undefined,
      townName: safeFreightFilterTown !== '__all__' ? safeFreightFilterTown : undefined,
      portCodeId: safeFreightFilterPort !== '__all__' ? parseInt(safeFreightFilterPort, 10) : undefined,
      distanceKm: safeFreightFilterDistance !== '__all__' ? parseInt(safeFreightFilterDistance, 10) : undefined,
    }),
    [safeFreightFilterRegion, safeFreightFilterCity, safeFreightFilterTown, safeFreightFilterPort, safeFreightFilterDistance],
  );
  const { data: safeFreightRatesData, isLoading: safeFreightRatesLoading } = useSafeFreightRates(
    transportFeeSearchOpen && isTransportFeeContainerMode ? safeFreightQueryParams : undefined,
  );
  const safeFreightRates = safeFreightRatesData?.data ?? [];
  // 할증: 1개 20%, 2개 30% (화물자동차 운임 규정), 백원 단위 반올림
  const applySafeFreightSurcharge = React.useCallback((baseRate: number) => {
    const count = (safeFreightSurchargeHoliday ? 1 : 0) + (safeFreightSurchargeLateNight ? 1 : 0);
    if (count === 0) return baseRate;
    const multiplier = count === 1 ? 1.2 : 1.3;
    return Math.round((baseRate * multiplier) / 100) * 100;
  }, [safeFreightSurchargeHoliday, safeFreightSurchargeLateNight]);

  // 운송비 검색 팝업 열릴 때 컨테이너 모드면 하차지 지역/시군구로 초기화
  React.useEffect(() => {
    if (!transportFeeSearchOpen || !isTransportFeeContainerMode) return;
    const unloadRegion = watch('unloadingRegion');
    const unloadCity = watch('unloadingCity');
    if (unloadRegion && unloadRegion !== '__none__') setSafeFreightFilterRegion(unloadRegion);
    if (unloadCity) setSafeFreightFilterCity(unloadCity);
  }, [transportFeeSearchOpen, isTransportFeeContainerMode]);

  // 운송비 변경 또는 컨테이너 추가/삭제 시 모든 컨테이너의 판매 단가 재계산
  const transportFeeValue = watch('transportFee');
  const selectedContainersValue = watch('selectedContainers') || [];
  const previousTransportFeeRef = React.useRef<number | null | undefined>(undefined);
  const previousContainersRef = React.useRef<string>('');
  const isRecalculatingRef = React.useRef(false);
  // 컨테이너별 남은 수량(참조용) — 베일/중량 입력 변경 시 바뀌지 않도록 로드 시점 값 캐시
  const containerRemainingCacheRef = React.useRef<Record<string, { remainingWeight: number | null; remainingBales: number | null }>>({});
  React.useEffect(() => {
    if (open) containerRemainingCacheRef.current = {};
  }, [open]);
  
  // 컨테이너 목록의 변경을 감지하기 위한 키 생성 (ID와 중량 기반)
  const containersKey = React.useMemo(() => {
    return selectedContainersValue.map(c => {
      const weight = c.containerType === 'CARGO' ? (c.cargoWeight ?? 0) : (c.weight ?? 0);
      return `${c.id}:${weight}`;
    }).join('|');
  }, [selectedContainersValue]);

  const selectedBlPackingGroups = React.useMemo(() => {
    if (!useBlProductLine) return [];
    return groupContainersByBlPacking(selectedContainersValue);
  }, [selectedContainersValue, useBlProductLine]);
  
  React.useEffect(() => {
    // 이미 재계산 중이면 실행하지 않음 (무한 루프 방지)
    if (isRecalculatingRef.current) return;
    
    const currentTransportFee = transportFeeValue ?? null;
    const currentContainersKey = containersKey;
    
    // 운송비와 컨테이너 목록이 모두 변경되지 않았으면 실행하지 않음
    const transportFeeChanged = previousTransportFeeRef.current !== currentTransportFee;
    const containersChanged = previousContainersRef.current !== currentContainersKey;
    
    if (!transportFeeChanged && !containersChanged) return;
    
    // 컨테이너가 없으면 이전 값만 저장하고 종료
    if (selectedContainersValue.length === 0) {
      previousTransportFeeRef.current = currentTransportFee;
      previousContainersRef.current = currentContainersKey;
      return;
    }
    
    // 초기 렌더링 시 이전 값 저장. 단, 컨테이너가 방금 추가된 경우(containersChanged)는 계산 수행
    if (previousTransportFeeRef.current === undefined && !containersChanged) {
      previousTransportFeeRef.current = currentTransportFee;
      previousContainersRef.current = currentContainersKey;
      return;
    }
    
    // 재계산 시작
    isRecalculatingRef.current = true;
    
    if (selectedContainersValue.length === 0) {
      previousTransportFeeRef.current = currentTransportFee;
      previousContainersRef.current = currentContainersKey;
      isRecalculatingRef.current = false;
      return;
    }

    const transportFee = transportFeeValue ?? 0;
    
    // 전체 중량 합계 계산 (운송비 분배를 위해)
    // 컨테이너일 때: 전체 중량(weight) 사용
    // 카고일 때: 설정한 중량(cargoWeight) 사용
    const totalWeight = selectedContainersValue.reduce((sum, container) => {
      const currentWeight = container.containerType === 'CARGO'
        ? (container.cargoWeight ?? 0)  // 카고일 때는 설정한 중량만 사용
        : (container.weight ?? 0);      // 컨테이너일 때는 전체 중량 사용
      return sum + currentWeight;
    }, 0);
    
    const updatedContainers = selectedContainersValue.map((container) => {
      // 원가 결정: 확정이면 확정원가, 예정이면 원화(comparisonPurchaseCost) 우선, 없으면 pendingPurchaseCost
      const purchaseCost = container.inboundStatus === 'INBOUND_CONFIRMED'
        ? (container.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : 0)
        : (container.comparisonPurchaseCost != null ? Number(container.comparisonPurchaseCost) : (container.pendingPurchaseCost ? Number(container.pendingPurchaseCost) : 0));
      
      // 중량 결정 (톤 단위)
      // 컨테이너일 때: 전체 중량(weight) 사용
      // 카고일 때: 설정한 중량(cargoWeight) 사용
      const currentWeight = container.containerType === 'CARGO'
        ? (container.cargoWeight ?? 0)  // 카고일 때는 설정한 중량만 사용
        : (container.weight ?? 0);      // 컨테이너일 때는 전체 중량 사용
      
      // 중량이 0이면 운송비 분배하지 않음
      if (currentWeight === 0 || totalWeight === 0) {
        // 판매단가 유지 (있으면), 없으면 원가 + 마진
        const existingSalesUnitPrice = container.salesUnitPrice ?? null;
        const margin = container.margin ?? 0;
        const salesUnitPrice = existingSalesUnitPrice ?? (purchaseCost + margin);
        const salesPrice = salesUnitPrice * currentWeight * 1000;
        return {
          ...container,
          salesUnitPrice,
          salesPrice,
        };
      }
      
      // 운송비를 중량 비례 분배
      const weightRatio = currentWeight / totalWeight;
      const allocatedTransportFee = transportFee * weightRatio;
      
      // kg당 운송비 = 분배된 운송비 / (중량(톤) * 1000)
      const transportFeePerKg = allocatedTransportFee / (currentWeight * 1000);
      
      // 판매단가가 이미 있으면 유지하고 마진만 재계산
      // 판매단가가 없으면 원가 + 운송비 + 마진으로 계산
      const existingSalesUnitPrice = container.salesUnitPrice ?? null;
      let salesUnitPrice: number;
      let margin: number;
      
      if (existingSalesUnitPrice != null && existingSalesUnitPrice > 0) {
        // 판매단가 유지, 마진 재계산
        salesUnitPrice = existingSalesUnitPrice;
        margin = salesUnitPrice - purchaseCost - transportFeePerKg;
      } else {
        // 판매단가가 없으면 기존 마진 유지하고 판매단가 계산
        margin = container.margin ?? 0;
        salesUnitPrice = purchaseCost + transportFeePerKg + margin;
      }
      
      // 판매가 = 판매단가 * 중량(톤) * 1000
      const salesPrice = salesUnitPrice * currentWeight * 1000;
      
      return {
        ...container,
        salesUnitPrice,
        margin,
        salesPrice,
      };
    });
    
    // 이전 값을 업데이트 (setValue 호출 전에 업데이트하여 무한 루프 방지)
    previousTransportFeeRef.current = currentTransportFee;
    previousContainersRef.current = currentContainersKey;
    
    // setValue 호출
    setValue('selectedContainers', updatedContainers, { shouldDirty: true });
    
    // 다음 틱에서 재계산 플래그 해제
    setTimeout(() => {
      isRecalculatingRef.current = false;
    }, 0);
  }, [transportFeeValue, containersKey, selectedContainersValue, setValue]);

  // 제품 코드를 이름으로 변환하는 함수
  const getProductName = React.useCallback((productCode?: string | null) => {
    if (!productCode) return '-';
    const product = products?.find((p) => (p.value ?? p.name) === productCode);
    return product?.name ?? productCode;
  }, [products]);

  const regionOptions = React.useMemo(() => {
    if (!regions) return [];
    return regions.map((r) => ({ value: r.name, label: r.name }));
  }, [regions]);

  const regionValue = watch('region');
  const selectedCustomerRegion = React.useMemo(() => {
    if (!regionValue) return '__none__';
    // regionOptions에 해당 지역이 있는지 확인
    const exists = regionOptions.some((opt) => opt.value === regionValue);
    return exists ? regionValue : '__none__';
  }, [regionValue, regionOptions]);

  // regions가 로드된 후 지역 값이 제대로 설정되었는지 확인
  React.useEffect(() => {
    if (mode === 'edit' && salesDetail && open && regions && regionValue) {
      // regionOptions에 해당 지역이 있는지 확인하고, 없으면 다시 설정
      const exists = regionOptions.some((opt) => opt.value === regionValue);
      if (!exists && salesDetail.customerRegion) {
        // regionOptions에 없으면 다시 설정 시도
        setValue('region', salesDetail.customerRegion, { shouldDirty: false });
      }
    }
  }, [mode, salesDetail, open, regions, regionOptions, regionValue, setValue]);

  // 상품 선택 drawer 상태
  const [productSelectDrawerOpen, setProductSelectDrawerOpen] = React.useState(false);
  const [selectedProductForSearch, setSelectedProductForSearch] = React.useState<string>('');
  const [selectedInboundStatus, setSelectedInboundStatus] = React.useState<'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | '__all__' | ''>('__all__');
  const [selectedInventoryStatus, setSelectedInventoryStatus] = React.useState<string>('__all__'); // 재고 상태: 가용, 예약됨 등
  const [bkBlSearch, setBkBlSearch] = React.useState<string>('');
  const [containers, setContainers] = React.useState<SelectedContainer[]>([]);
  const [allContainers, setAllContainers] = React.useState<SelectedContainer[]>([]); // 전체 컨테이너 목록 (페이지네이션 전)
  const [blPackingRows, setBlPackingRows] = React.useState<SalesBlPackingSelectRow[]>([]);
  const [containersLoading, setContainersLoading] = React.useState(false);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [containerPage, setContainerPage] = React.useState(1);
  const [containerPageSize, setContainerPageSize] = React.useState(10);
  const [containerSortBy, setContainerSortBy] = React.useState<string>('etaDate');
  const [containerSortOrder, setContainerSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [recalculatingCosts, setRecalculatingCosts] = React.useState<Set<string>>(new Set()); // 원가 재계산 중인 컨테이너 ID

  // Customer region/city
  const selectedCustomerRegionId = React.useMemo(() => {
    if (!selectedCustomerRegion || selectedCustomerRegion === '__none__') return undefined;
    return regions?.find((r) => r.name === selectedCustomerRegion)?.id;
  }, [selectedCustomerRegion, regions]);
  const { data: customerCities } = useCities(selectedCustomerRegionId);

  // 하차지 지역/시군구
  const unloadingRegionValue = watch('unloadingRegion') || '__none__';
  const unloadingCityValue = watch('unloadingCity') || '';
  const requestVehicleValue = watch('requestVehicle') || '';
  const unloadingRegionId = React.useMemo(() => {
    if (!unloadingRegionValue || unloadingRegionValue === '__none__' || unloadingRegionValue === '') {
      return undefined;
    }
    return regions?.find((r) => r.name === unloadingRegionValue)?.id;
  }, [unloadingRegionValue, regions]);
  const { data: unloadingCities } = useCities(unloadingRegionId);

  const watchedCustomerId = watch('customerId');
  const savedDeliveryListEnabled =
    open &&
    !!watchedCustomerId &&
    (mode === 'create' || mode === 'edit' || mode === 'confirm');
  const { data: savedDeliveryAddresses = [], isLoading: savedDeliveryAddressesLoading } =
    useCustomerDeliveryAddresses(savedDeliveryListEnabled ? watchedCustomerId : undefined);
  savedDeliveryAddressesRef.current = savedDeliveryAddresses;

  React.useEffect(() => {
    if (!open) {
      customerUpsertBaselineRef.current = null;
      pendingSubmitAfterCustomerConfirmRef.current = null;
      setCustomerUpsertConfirmOpen(false);
      setCustomerUpsertDiffs([]);
      setDeliverySaveConfirmDiffs([]);
      setSaleUnloadingConfirmDiffs([]);
      setCustomerUpsertConfirmBusy(false);
      deliveryUnloadingBaselineRef.current = null;
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || mode === 'edit' || mode === 'confirm') return;
    if (!watchedCustomerId) {
      customerUpsertBaselineRef.current = null;
    }
  }, [open, mode, watchedCustomerId]);

  React.useLayoutEffect(() => {
    if (mode !== 'create') return;
    setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
    setSameAsCustomerAddress(true);
  }, [watchedCustomerId, mode]);

  /** 복사하여 등록: 하차지가 대표와 다르면 배송지 목록과 매칭해 선택 상태 복원 (reset(initialData) 이후에 실행되어야 함 → useEffect) */
  React.useEffect(() => {
    if (!open) {
      initialDeliveryCopyMatchRef.current = false;
      return;
    }
    if (mode !== 'create') return;
    if (!initialData) {
      initialDeliveryCopyMatchRef.current = true;
      return;
    }
    if (savedDeliveryAddressesLoading) return;
    if (initialDeliveryCopyMatchRef.current) return;
    const u = getValues();
    const hasUnloading =
      u.unloadingPostalCode ||
      u.unloadingAddress ||
      u.unloadingAddressDetail ||
      u.unloadingRegion ||
      u.unloadingCity;
    if (!hasUnloading) {
      initialDeliveryCopyMatchRef.current = true;
      return;
    }
    const resolvedCustomerLine = resolveSalesCustomerDefaultLine({
      customerAddress: u.customerAddress,
      customerAddressRoad: u.customerAddressRoad,
      customerAddressJibun: u.customerAddressJibun,
      customerAddressDefaultType: u.customerAddressDefaultType,
    });
    const isSameAsCustomer =
      u.unloadingPostalCode === u.customerPostalCode &&
      (u.unloadingAddress === resolvedCustomerLine ||
        u.unloadingAddress === (u.customerAddress ?? '').trim()) &&
      u.unloadingAddressDetail === u.addressDetail &&
      u.unloadingRegion === u.region &&
      u.unloadingCity === u.customerCity;
    if (isSameAsCustomer) {
      initialDeliveryCopyMatchRef.current = true;
      return;
    }
    const match = savedDeliveryAddresses.find((row) =>
      deliveryRowMatchesUnloading(row, u.unloadingPostalCode, u.unloadingAddress, u.unloadingAddressDetail),
    );
    if (match) {
      flushSync(() => {
        setUnloadingAddressChoice(match.id);
        setSameAsCustomerAddress(false);
        applyUnloadingFromSavedDeliveryAddress(match, setValue);
      });
    } else if (!isSameAsCustomer) {
      flushSync(() => setSameAsCustomerAddress(false));
    }
    initialDeliveryCopyMatchRef.current = true;
  }, [
    open,
    mode,
    initialData,
    savedDeliveryAddresses,
    savedDeliveryAddressesLoading,
    getValues,
    setValue,
  ]);

  React.useEffect(() => {
    if (!open) {
      editUnloadingChoiceSyncRef.current = null;
      return;
    }
    if (mode !== 'edit' && mode !== 'confirm') return;
    if (!salesDetail?.id || !watchedCustomerId) return;
    if (savedDeliveryAddressesLoading) return;
    if (editUnloadingChoiceSyncRef.current === salesDetail.id) return;

    const u = getValues();
    const hasUnloading =
      (u.unloadingPostalCode || '').trim() ||
      (u.unloadingAddress || '').trim() ||
      (u.unloadingAddressRoad || '').trim() ||
      (u.unloadingAddressJibun || '').trim() ||
      (u.unloadingAddressDetail || '').trim() ||
      (u.unloadingRegion || '').trim() ||
      (u.unloadingCity || '').trim();

    if (!hasUnloading) {
      setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
      setSameAsCustomerAddress(true);
      editUnloadingChoiceSyncRef.current = salesDetail.id;
      return;
    }

    if (unloadingMatchesCustomerDefault(u)) {
      setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
      setSameAsCustomerAddress(true);
      editUnloadingChoiceSyncRef.current = salesDetail.id;
      return;
    }

    const unloadingLineForMatch =
      resolveUnloadingLineFromParts({
        unloadingAddressRoad: u.unloadingAddressRoad,
        unloadingAddressJibun: u.unloadingAddressJibun,
        unloadingAddressDefaultType: u.unloadingAddressDefaultType,
      }).trim() || (u.unloadingAddress || '').trim();

    const match = savedDeliveryAddresses.find((row) =>
      deliveryRowMatchesUnloading(
        row,
        u.unloadingPostalCode,
        unloadingLineForMatch || u.unloadingAddress,
        u.unloadingAddressDetail,
      ),
    );

    if (match) {
      setUnloadingAddressChoice(match.id);
      setSameAsCustomerAddress(false);
    } else {
      setUnloadingAddressChoice(UNLOADING_CHOICE_SALE_SNAPSHOT);
      setSameAsCustomerAddress(false);
    }
    editUnloadingChoiceSyncRef.current = salesDetail.id;
  }, [
    open,
    mode,
    salesDetail?.id,
    watchedCustomerId,
    savedDeliveryAddressesLoading,
    savedDeliveryAddresses,
    getValues,
  ]);

  React.useEffect(() => {
    if (unloadingAddressChoice === UNLOADING_CHOICE_CUSTOMER_DEFAULT) return;
    if (unloadingAddressChoice === UNLOADING_CHOICE_SALE_SNAPSHOT) return;
    if (!savedDeliveryAddresses.length) return;
    if (!savedDeliveryAddresses.some((a) => a.id === unloadingAddressChoice)) {
      setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
      setSameAsCustomerAddress(true);
    }
  }, [savedDeliveryAddresses, unloadingAddressChoice]);

  const customerPostalW = watch('customerPostalCode');
  const customerAddressW = watch('customerAddress');
  const customerAddressRoadW = watch('customerAddressRoad');
  const customerAddressJibunW = watch('customerAddressJibun');
  const customerAddressDefTypeW = watch('customerAddressDefaultType');
  const customerLegalBCodeW = watch('customerLegalBCode');
  const addressDetailW = watch('addressDetail');
  const customerCityW = watch('customerCity');
  const roadTrim = (customerAddressRoadW || '').trim();
  const jibunTrim = (customerAddressJibunW || '').trim();

  const hasDefaultRepresentativeAddress = React.useMemo(
    () =>
      (customerPostalW || '').trim().length > 0 ||
      (customerAddressW || '').trim().length > 0 ||
      roadTrim.length > 0 ||
      jibunTrim.length > 0,
    [customerPostalW, customerAddressW, roadTrim, jibunTrim],
  );

  /** 고객 선택 후 대표 주소가 비어 있을 때 안내 (등록 모드 전용) */
  const showUnloadingAddressNeededHint = Boolean(
    mode === 'create' &&
      watchedCustomerId &&
      unloadingAddressChoice === UNLOADING_CHOICE_CUSTOMER_DEFAULT &&
      !hasDefaultRepresentativeAddress,
  );

  /** 판매 수정·확정: 고객 카드 대표 주소로 하차지 필드 덮어쓰기 */
  const handleFillUnloadingFromCustomerDefault = React.useCallback(() => {
    const resolvedLine = resolveSalesCustomerDefaultLine({
      customerAddress: customerAddressW,
      customerAddressRoad: customerAddressRoadW,
      customerAddressJibun: customerAddressJibunW,
      customerAddressDefaultType: customerAddressDefTypeW,
    });
    setValue('unloadingPostalCode', customerPostalW || '', { shouldDirty: true });
    setValue('unloadingAddressRoad', customerAddressRoadW || '', { shouldDirty: true });
    setValue('unloadingAddressJibun', customerAddressJibunW || '', { shouldDirty: true });
    setValue('unloadingLegalBCode', customerLegalBCodeW || '', { shouldDirty: true });
    setValue('unloadingAddressDefaultType', customerAddressDefTypeW || '', { shouldDirty: true });
    setValue('unloadingAddress', resolvedLine || customerAddressW || '', { shouldDirty: true });
    setValue('unloadingAddressDetail', addressDetailW || '', { shouldDirty: true });
    setValue('unloadingRegion', regionValue || '', { shouldDirty: true });
    setValue('unloadingCity', customerCityW || '', { shouldDirty: true });
  }, [
    setValue,
    customerPostalW,
    customerAddressW,
    customerAddressRoadW,
    customerAddressJibunW,
    customerAddressDefTypeW,
    customerLegalBCodeW,
    addressDetailW,
    regionValue,
    customerCityW,
  ]);

  const unloadingSelectValue = React.useMemo(() => {
    if (unloadingAddressChoice === UNLOADING_CHOICE_CUSTOMER_DEFAULT) {
      return UNLOADING_CHOICE_CUSTOMER_DEFAULT;
    }
    if (
      (mode === 'edit' || mode === 'confirm') &&
      unloadingAddressChoice === UNLOADING_CHOICE_SALE_SNAPSHOT
    ) {
      return UNLOADING_CHOICE_SALE_SNAPSHOT;
    }
    if (savedDeliveryAddresses.some((a) => a.id === unloadingAddressChoice)) {
      return unloadingAddressChoice;
    }
    return UNLOADING_CHOICE_CUSTOMER_DEFAULT;
  }, [mode, unloadingAddressChoice, savedDeliveryAddresses]);

  // 지역이 변경되면 시/군/구 목록이 로드된 후 pendingCustomerCity 처리
  React.useEffect(() => {
    if (!pendingCustomerCity) return;
    if (!customerCities || customerCities.length === 0) return;
    const matched = customerCities.find((c) => c.name === pendingCustomerCity);
    if (matched) {
      setValue('customerCity', matched.name, { shouldDirty: true, shouldValidate: true });
      setPendingCustomerCity(null);
      // 등록(create)만: 시군구 정규화 직후 기준을 맞춰 불필요한 diff를 줄임.
      // 수정·확정(edit/confirm)에서는 기준을 DB 로드 시점에 고정해야 함. 여기서 refresh 하면
      // 주소 검색 직후 스냅샷이 덮여져 '저장 전 확인' 팝업에 변경 내용이 안 나오는 문제가 난다.
      if (mode === 'create') {
        queueMicrotask(() => refreshCustomerUpsertBaseline());
      }
    }
  }, [pendingCustomerCity, customerCities, setValue, refreshCustomerUpsertBaseline, mode]);

  React.useEffect(() => {
    if (!pendingUnloadingCity) return;
    if (!unloadingCities || unloadingCities.length === 0) return;
    const matched = unloadingCities.find((c) => c.name === pendingUnloadingCity);
    if (matched) {
      setValue('unloadingCity', matched.name, { shouldDirty: true, shouldValidate: true });
      setPendingUnloadingCity(null);
    }
  }, [pendingUnloadingCity, unloadingCities, setValue]);

  // 하차지 주소와 동일 체크 시 고객 주소로 복사 (등록 시에만 — 수정·확정에서는 스냅샷 유지)
  React.useEffect(() => {
    if (mode !== 'create') return;
    if (!sameAsCustomerAddress) return;
    if (initialData && !initialDeliveryCopyMatchRef.current) return;

    const resolvedLine = resolveSalesCustomerDefaultLine({
      customerAddress: customerAddressW,
      customerAddressRoad: customerAddressRoadW,
      customerAddressJibun: customerAddressJibunW,
      customerAddressDefaultType: customerAddressDefTypeW,
    });

    setValue('unloadingPostalCode', customerPostalW || '', { shouldDirty: true });
    setValue('unloadingAddressRoad', customerAddressRoadW || '', { shouldDirty: true });
    setValue('unloadingAddressJibun', customerAddressJibunW || '', { shouldDirty: true });
    setValue('unloadingLegalBCode', customerLegalBCodeW || '', { shouldDirty: true });
    setValue('unloadingAddressDefaultType', customerAddressDefTypeW || '', { shouldDirty: true });
    setValue('unloadingAddress', resolvedLine || customerAddressW || '', { shouldDirty: true });
    setValue('unloadingAddressDetail', addressDetailW || '', { shouldDirty: true });
    setValue('unloadingRegion', regionValue || '', { shouldDirty: true });
    setValue('unloadingCity', customerCityW || '', { shouldDirty: true });
  }, [
    mode,
    initialData,
    sameAsCustomerAddress,
    setValue,
    customerPostalW,
    customerAddressW,
    customerAddressRoadW,
    customerAddressJibunW,
    customerAddressDefTypeW,
    customerLegalBCodeW,
    addressDetailW,
    regionValue,
    customerCityW,
  ]);

  /** 고객이 바뀌면 이전 하차지가 새 고객에 남지 않도록 비움 */
  const clearUnloadingOnCustomerChange = React.useCallback(() => {
    setValue('unloadingPostalCode', '', { shouldDirty: true });
    setValue('unloadingAddress', '', { shouldDirty: true });
    setValue('unloadingAddressRoad', '', { shouldDirty: true });
    setValue('unloadingAddressJibun', '', { shouldDirty: true });
    setValue('unloadingLegalBCode', '', { shouldDirty: true });
    setValue('unloadingAddressDefaultType', '', { shouldDirty: true });
    setValue('unloadingAddressDetail', '', { shouldDirty: true });
    setValue('unloadingRegion', '', { shouldDirty: true });
    setValue('unloadingCity', '', { shouldDirty: true });
    setPendingUnloadingCity(null);
    setUnloadingAddressChoice(UNLOADING_CHOICE_CUSTOMER_DEFAULT);
    setSameAsCustomerAddress(true);
    deliveryUnloadingBaselineRef.current = null;
  }, [setValue]);

  // 운송비 변경 핸들러 (debounce 적용 및 blur 즉시 반영)
  const transportFeeChangeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const transportFeeBlurTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [transportFeeInputValue, setTransportFeeInputValue] = React.useState<number | undefined>(undefined);

  const handleTransportFeeChange = React.useCallback((value: number | undefined) => {
    // 입력 중인 값은 내부 state에만 저장 (blur 이벤트에서 처리)
    setTransportFeeInputValue(value);
  }, []);

  const handleTransportFeeBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    // blur 시 즉시 저장 (debounce 대기 중인 값이 있으면 취소하고 즉시 저장)
    if (transportFeeChangeTimeoutRef.current) {
      clearTimeout(transportFeeChangeTimeoutRef.current);
      transportFeeChangeTimeoutRef.current = null;
    }
    
    // 입력 필드의 실제 값을 확인
    const inputValue = e.target.value.replace(/,/g, '').trim();
    const numValue = inputValue === '' ? 0 : parseFloat(inputValue);
    
    // 값이 비어있거나 NaN이면 0으로 설정 (마진과 동일하게 처리)
    const finalValue = isNaN(numValue) ? 0 : numValue;
    
    // 현재 운송비 값과 비교하여 변경된 경우에만 setValue 호출
    const currentTransportFee = watch('transportFee') ?? 0;
    if (currentTransportFee !== finalValue) {
      // 마진과 동일하게 0으로 설정 (null이 아닌 0)
      setValue('transportFee', finalValue, { shouldDirty: true });
    }
    setTransportFeeInputValue(undefined);
  }, [setValue, watch]);

  // 컴포넌트 언마운트 시 타이머 정리
  React.useEffect(() => {
    return () => {
      if (transportFeeChangeTimeoutRef.current) {
        clearTimeout(transportFeeChangeTimeoutRef.current);
      }
      if (transportFeeBlurTimeoutRef.current) {
        clearTimeout(transportFeeBlurTimeoutRef.current);
      }
    };
  }, []);

  // 전화번호 포맷터
  const formatPhone = React.useCallback((input: string): string => {
    if (!input) return '';
    const digits = input.replace(/[^0-9]/g, '');
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }, []);

  // 고객 정보 조회
  const performLookup = React.useCallback(
    async (rawPhone: string) => {
      const phoneValue = rawPhone?.trim();
      if (!phoneValue) {
        return;
      }
      setValue('phone', formatPhone(phoneValue), { shouldDirty: true });
      try {
        const response = await api.get('/consultations/lookup', {
          params: { phone: phoneValue },
        });
        const result = response.data;
        if (result.customer) {
          setValue('customerId', result.customer.id, { shouldDirty: true });
          setValue('companyName', result.customer.companyName ?? '', { shouldDirty: true });
          setValue('ceo', result.customer.ceo ?? '', { shouldDirty: true });
          setValue('region', result.customer.region ?? '', { shouldDirty: true });
          setValue('addressDetail', result.customer.addressDetail ?? '', { shouldDirty: true });
          setValue('customerPostalCode', result.customer.customerPostalCode ?? '', { shouldDirty: true });
          setValue('customerAddress', result.customer.customerAddress ?? '', { shouldDirty: true });
          setValue('customerAddressRoad', (result.customer as { customerAddressRoad?: string }).customerAddressRoad ?? '', {
            shouldDirty: true,
          });
          setValue('customerAddressJibun', (result.customer as { customerAddressJibun?: string }).customerAddressJibun ?? '', {
            shouldDirty: true,
          });
          setValue('customerLegalBCode', (result.customer as { customerLegalBCode?: string }).customerLegalBCode ?? '', {
            shouldDirty: true,
          });
          setValue(
            'customerAddressDefaultType',
            (result.customer as { customerAddressDefaultType?: string }).customerAddressDefaultType ?? '',
            { shouldDirty: true },
          );
          if (result.customer.customerCity) {
            setPendingCustomerCity(result.customer.customerCity);
          } else {
            setValue('customerCity', '', { shouldDirty: true });
          }
          clearUnloadingOnCustomerChange();
          queueMicrotask(() => refreshCustomerUpsertBaseline());
        }
      } catch (error: unknown) {
        console.error('고객 조회 오류:', error);
        toast({
          title: '조회 실패',
          description: '고객 조회 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
      }
    },
    [formatPhone, setValue, clearUnloadingOnCustomerChange, refreshCustomerUpsertBaseline],
  );

  // 주소 검색 모달 닫기
  const closeCustomerAddressSearch = React.useCallback(() => {
    setCustomerAddressModalOpen(false);
  }, []);

  // 하차지 주소 검색 모달 닫기
  const closeUnloadingAddressSearch = React.useCallback(() => {
    setUnloadingAddressModalOpen(false);
  }, []);

  // 하차지 주소 검색 팝업 열기
  const handleUnloadingAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    // 모달을 먼저 열어서 contentElement가 준비되도록 함
    setUnloadingAddressModalOpen(true);

    // 다음 틱에서 embed 실행
    setTimeout(() => {
      const contentElement = unloadingAddressContentRef.current;
      if (!contentElement) {
        setUnloadingAddressModalOpen(false);
        toast({
          title: '오류',
          description: '주소 검색 UI를 불러올 수 없습니다.',
          className: 'border border-red-300 text-red-600',
        });
        return;
      }

      if (!window.daum?.Postcode) {
        setUnloadingAddressModalOpen(false);
        toast({
          title: '주소검색 준비 중',
          description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
          className: 'border border-yellow-300 text-yellow-600',
        });
        return;
      }

      contentElement.innerHTML = '';

      const Postcode = window.daum.Postcode;

      new Postcode({
        oncomplete: (data: DaumPostcodeData) => {
          if (mode === 'create') {
            setSameAsCustomerAddress(false);
          } else if (mode === 'edit' || mode === 'confirm') {
            const cur = unloadingAddressChoiceRef.current;
            if (
              !isSavedDeliveryAddressChoice(cur, savedDeliveryAddressesRef.current) &&
              cur !== UNLOADING_CHOICE_CUSTOMER_DEFAULT
            ) {
              setUnloadingAddressChoice(UNLOADING_CHOICE_SALE_SNAPSHOT);
            }
            setSameAsCustomerAddress(false);
          }
          let roadLine = (data.roadAddress || '').trim();
          let extraAddress = '';
          if (data.userSelectedType === 'R') {
            if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) {
              extraAddress += data.bname;
            }
            if (data.buildingName !== '' && data.apartment === 'Y') {
              extraAddress += extraAddress !== '' ? ', ' + data.buildingName : data.buildingName;
            }
            if (extraAddress !== '') {
              extraAddress = ' (' + extraAddress + ')';
            }
          }
          if (roadLine) {
            roadLine = roadLine + extraAddress;
          }
          const jibunLine = (data.jibunAddress || '').trim();
          const bcode = (data.bcode ?? '').replace(/\D/g, '').slice(0, 10);
          const defaultType = data.userSelectedType === 'R' ? 'ROAD' : 'JIBUN';
          const line =
            resolveUnloadingLineFromParts({
              unloadingAddressRoad: roadLine,
              unloadingAddressJibun: jibunLine,
              unloadingAddressDefaultType: defaultType,
            }) ||
            jibunLine ||
            roadLine;

          setValue('unloadingPostalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
          setValue('unloadingLegalBCode', bcode, { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddressRoad', roadLine, { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddressJibun', jibunLine, { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddressDefaultType', defaultType, { shouldDirty: true, shouldValidate: true });
          setValue('unloadingAddress', line, { shouldDirty: true, shouldValidate: true });

          if (data.sido && regions) {
            const normalizedRegionName = normalizeRegionNameFromAddress(data.sido);
            const matchedRegion = regions.find((r) => r.name === normalizedRegionName);
            if (matchedRegion) {
              setValue('unloadingRegion', matchedRegion.name, { shouldDirty: true, shouldValidate: true });
            } else {
              setValue('unloadingRegion', normalizedRegionName, { shouldDirty: true, shouldValidate: true });
            }
          }
          if (data.sigungu) {
            setPendingUnloadingCity(data.sigungu);
            const normalizedRegionName = data.sido ? normalizeRegionNameFromAddress(data.sido) : null;
            const regionId = normalizedRegionName ? regions?.find((r) => r.name === normalizedRegionName)?.id : undefined;
            if (regionId && unloadingCities) {
              const matchedCity = unloadingCities.find((c) => c.name === data.sigungu);
              if (matchedCity) {
                setValue('unloadingCity', matchedCity.name, { shouldDirty: true, shouldValidate: true });
                setPendingUnloadingCity(null);
              } else {
                setValue('unloadingCity', data.sigungu, { shouldDirty: true, shouldValidate: true });
              }
            } else {
              setValue('unloadingCity', data.sigungu || '', { shouldDirty: true, shouldValidate: true });
            }
          }

          closeUnloadingAddressSearch();
        },
        width: '100%',
        height: '100%',
      }).embed(contentElement);
    }, 100);
  }, [
    closeUnloadingAddressSearch,
    mode,
    regions,
    unloadingCities,
    setValue,
    setSameAsCustomerAddress,
    setPendingUnloadingCity,
    toast,
  ]);

  // Drawer가 닫힐 때 주소 검색 모달이 열려있으면 drawer를 닫지 않도록 처리
  const handleDrawerOpenChange = React.useCallback((isOpen: boolean) => {
    if (!isOpen && (customerAddressModalOpen || unloadingAddressModalOpen)) {
      return;
    }
    onOpenChange(isOpen);
  }, [customerAddressModalOpen, unloadingAddressModalOpen, onOpenChange]);

  // Drawer가 닫힐 때 주소 검색 모달도 닫기
  React.useEffect(() => {
    if (!open) {
      if (customerAddressModalOpen) {
        setCustomerAddressModalOpen(false);
      }
      if (unloadingAddressModalOpen) {
        setUnloadingAddressModalOpen(false);
      }
    }
  }, [open, customerAddressModalOpen, unloadingAddressModalOpen]);

  React.useEffect(() => {
    if (!open) {
      reset(defaultValues);
      setPendingCustomerCity(null);
      setPendingUnloadingCity(null);
    }
  }, [open, reset]);

  // 업체명 검색 핸들러
  const resetCompanySearchState = React.useCallback(() => {
    setCompanySearchResults([]);
    setCompanySearchError(null);
    setCompanySearchTerm('');
    setCompanySearchLoading(false);
    setCompanySearchAttempted(false);
  }, []);

  const handleCompanySearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setCompanySearchOpen(nextOpen);
      if (!nextOpen) {
        resetCompanySearchState();
      } else {
        // 팝업 열 때 현재 업체명을 검색어로 설정
        const currentCompanyName = watch('companyName');
        if (currentCompanyName) {
          setCompanySearchTerm(currentCompanyName);
        }
      }
    },
    [resetCompanySearchState, watch],
  );

  const handleCompanySearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const keyword = companySearchTerm.trim();
      if (keyword.length < 2) {
        setCompanySearchError('두 글자 이상 입력해주세요.');
        setCompanySearchResults([]);
        setCompanySearchAttempted(false);
        return;
      }
      setCompanySearchAttempted(true);
      setCompanySearchLoading(true);
      setCompanySearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/company', {
          params: { keyword },
        });
        setCompanySearchResults(response.data);
        if (response.data.length === 0) {
          setCompanySearchError('일치하는 업체가 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        setCompanySearchError(message);
        setCompanySearchResults([]);
      } finally {
        setCompanySearchLoading(false);
      }
    },
    [companySearchTerm],
  );

  const handleSelectCompany = React.useCallback(
    (item: CompanySearchResult) => {
      handleCompanySearchOpenChange(false);
      if (item.id) {
        setValue('customerId', item.id, { shouldDirty: true });
      }
      if (item.companyName) {
        setValue('companyName', item.companyName, { shouldDirty: true });
      }
      if (item.ceo) {
        setValue('ceo', item.ceo, { shouldDirty: true });
      }
      if (item.phone) {
        setValue('phone', formatPhone(item.phone), { shouldDirty: true });
      } else {
        toast({
          title: '전화번호 정보 없음',
          description: '선택한 업체에는 전화번호가 없어 기본 정보만 채웠습니다.',
        });
      }
      // 주소 정보 (선택한 고객의 주소로 폼 채움)
      setValue('region', item.region ?? '', { shouldDirty: true });
      setValue('customerPostalCode', item.customerPostalCode ?? '', { shouldDirty: true });
      setValue('customerAddress', item.customerAddress ?? '', { shouldDirty: true });
      setValue('customerAddressRoad', item.customerAddressRoad ?? '', { shouldDirty: true });
      setValue('customerAddressJibun', item.customerAddressJibun ?? '', { shouldDirty: true });
      setValue('customerLegalBCode', item.customerLegalBCode ?? '', { shouldDirty: true });
      setValue('customerAddressDefaultType', item.customerAddressDefaultType ?? '', { shouldDirty: true });
      setValue('customerCity', item.customerCity ?? '', { shouldDirty: true });
      setValue('addressDetail', item.addressDetail ?? '', { shouldDirty: true });
      clearUnloadingOnCustomerChange();
      queueMicrotask(() => refreshCustomerUpsertBaseline());
    },
    [
      handleCompanySearchOpenChange,
      setValue,
      formatPhone,
      toast,
      clearUnloadingOnCustomerChange,
      refreshCustomerUpsertBaseline,
    ],
  );

  // 전화번호 검색 핸들러
  const resetPhoneSearchState = React.useCallback(() => {
    setPhoneSearchResults([]);
    setPhoneSearchError(null);
    setPhoneSearchTerm('');
    setPhoneSearchLoading(false);
    setPhoneSearchAttempted(false);
  }, []);

  const handlePhoneSearchOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setPhoneSearchOpen(nextOpen);
      if (!nextOpen) {
        resetPhoneSearchState();
      } else {
        // 팝업 열 때 현재 전화번호를 검색어로 설정
        const currentPhone = watch('phone');
        if (currentPhone) {
          setPhoneSearchTerm(currentPhone);
        }
      }
    },
    [resetPhoneSearchState, watch],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (productSelectDrawerOpen) {
        e.preventDefault();
        setProductSelectDrawerOpen(false);
        return;
      }
      if (companySearchOpen) {
        e.preventDefault();
        handleCompanySearchOpenChange(false);
        return;
      }
      if (phoneSearchOpen) {
        e.preventDefault();
        handlePhoneSearchOpenChange(false);
        return;
      }
      if (transportFeeSearchOpen) {
        e.preventDefault();
        setTransportFeeSearchOpen(false);
        return;
      }
      if (customerAddressModalOpen) {
        e.preventDefault();
        setCustomerAddressModalOpen(false);
        return;
      }
      if (unloadingAddressModalOpen) {
        e.preventDefault();
        setUnloadingAddressModalOpen(false);
        return;
      }
      e.preventDefault();
      handleDrawerOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    open,
    productSelectDrawerOpen,
    companySearchOpen,
    phoneSearchOpen,
    transportFeeSearchOpen,
    customerAddressModalOpen,
    unloadingAddressModalOpen,
    handleDrawerOpenChange,
    handleCompanySearchOpenChange,
    handlePhoneSearchOpenChange,
  ]);

  const handlePhoneSearch = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const phone = phoneSearchTerm.trim();
      if (!phone) {
        setPhoneSearchError('전화번호를 입력해주세요.');
        setPhoneSearchResults([]);
        setPhoneSearchAttempted(false);
        return;
      }
      setPhoneSearchAttempted(true);
      setPhoneSearchLoading(true);
      setPhoneSearchError(null);
      try {
        const response = await api.get<CompanySearchResult[]>('/consultations/search/phone', {
          params: { phone },
        });
        setPhoneSearchResults(response.data);
        if (response.data.length === 0) {
          setPhoneSearchError('일치하는 고객이 없습니다.');
        }
      } catch (error: unknown) {
        type ErrLike = { message?: string; response?: { data?: { message?: unknown; error?: unknown } } };
        const err = error as ErrLike | undefined;
        let message = '검색 중 오류가 발생했습니다.';
        const apiData = err?.response?.data;
        if (typeof apiData?.message === 'string') {
          message = apiData.message as string;
        } else if (Array.isArray(apiData?.message)) {
          message = (apiData?.message as unknown[]).join(', ');
        } else if (typeof apiData?.error === 'string') {
          message = apiData.error as string;
        } else if (typeof err?.message === 'string') {
          message = err.message;
        }
        setPhoneSearchError(message);
        setPhoneSearchResults([]);
      } finally {
        setPhoneSearchLoading(false);
      }
    },
    [phoneSearchTerm],
  );

  const handleSelectPhone = React.useCallback(
    (item: CompanySearchResult) => {
      handlePhoneSearchOpenChange(false);
      if (item.id) {
        setValue('customerId', item.id, { shouldDirty: true });
      }
      if (item.companyName) {
        setValue('companyName', item.companyName, { shouldDirty: true });
      }
      if (item.ceo) {
        setValue('ceo', item.ceo, { shouldDirty: true });
      }
      if (item.phone) {
        setValue('phone', formatPhone(item.phone), { shouldDirty: true });
      }
      // 주소 정보 (선택한 고객의 주소로 폼 채움)
      setValue('region', item.region ?? '', { shouldDirty: true });
      setValue('customerPostalCode', item.customerPostalCode ?? '', { shouldDirty: true });
      setValue('customerAddress', item.customerAddress ?? '', { shouldDirty: true });
      setValue('customerAddressRoad', item.customerAddressRoad ?? '', { shouldDirty: true });
      setValue('customerAddressJibun', item.customerAddressJibun ?? '', { shouldDirty: true });
      setValue('customerLegalBCode', item.customerLegalBCode ?? '', { shouldDirty: true });
      setValue('customerAddressDefaultType', item.customerAddressDefaultType ?? '', { shouldDirty: true });
      setValue('customerCity', item.customerCity ?? '', { shouldDirty: true });
      setValue('addressDetail', item.addressDetail ?? '', { shouldDirty: true });
      clearUnloadingOnCustomerChange();
      queueMicrotask(() => refreshCustomerUpsertBaseline());
    },
    [handlePhoneSearchOpenChange, setValue, formatPhone, clearUnloadingOnCustomerChange, refreshCustomerUpsertBaseline],
  );

  // 고객 주소 검색 팝업 열기
  const handleCustomerAddressSearch = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.daum?.Postcode) {
      toast({
        title: '주소검색 준비 중',
        description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
        className: 'border border-yellow-300 text-yellow-600',
      });
      return;
    }

    // 모달을 먼저 열어서 contentElement가 준비되도록 함
    setCustomerAddressModalOpen(true);

    // 다음 틱에서 embed 실행
    setTimeout(() => {
      const contentElement = customerAddressContentRef.current;
      if (!contentElement) {
        setCustomerAddressModalOpen(false);
        toast({
          title: '오류',
          description: '주소 검색 UI를 불러올 수 없습니다.',
          className: 'border border-red-300 text-red-600',
        });
        return;
      }

      if (!window.daum?.Postcode) {
        setCustomerAddressModalOpen(false);
        toast({
          title: '주소검색 준비 중',
          description: '주소검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
          className: 'border border-yellow-300 text-yellow-600',
        });
        return;
      }

      contentElement.innerHTML = '';

      const Postcode = window.daum.Postcode;

      new Postcode({
        oncomplete: (data: DaumPostcodeData) => {
          let roadLine = (data.roadAddress || '').trim();
          let extraAddress = '';
          if (data.userSelectedType === 'R') {
            if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) {
              extraAddress += data.bname;
            }
            if (data.buildingName !== '' && data.apartment === 'Y') {
              extraAddress += extraAddress !== '' ? ', ' + data.buildingName : data.buildingName;
            }
            if (extraAddress !== '') {
              extraAddress = ' (' + extraAddress + ')';
            }
          }
          if (roadLine) {
            roadLine = roadLine + extraAddress;
          }
          const jibunLine = (data.jibunAddress || '').trim();
          const bcode = (data.bcode ?? '').replace(/\D/g, '').slice(0, 10);
          const legacyOneLine = jibunLine || roadLine;

          setValue('customerPostalCode', data.zonecode || '', { shouldDirty: true, shouldValidate: true });
          setValue('customerLegalBCode', bcode, { shouldDirty: true, shouldValidate: true });
          setValue('customerAddress', legacyOneLine, { shouldDirty: true, shouldValidate: true });
          setValue('customerAddressRoad', roadLine, { shouldDirty: true, shouldValidate: true });
          setValue('customerAddressJibun', jibunLine, { shouldDirty: true, shouldValidate: true });
          setValue('customerAddressDefaultType', data.userSelectedType === 'R' ? 'ROAD' : 'JIBUN', {
            shouldDirty: true,
            shouldValidate: true,
          });

          if (data.sido && regions) {
            const normalizedRegionName = normalizeRegionNameFromAddress(data.sido);
            const matchedRegion = regions.find((r) => r.name === normalizedRegionName);
            if (matchedRegion) {
              setValue('region', matchedRegion.name, { shouldDirty: true, shouldValidate: true });
            } else {
              setValue('region', normalizedRegionName, { shouldDirty: true, shouldValidate: true });
            }
          }
          if (data.sigungu) {
            setPendingCustomerCity(data.sigungu);
            const normalizedRegionName = data.sido ? normalizeRegionNameFromAddress(data.sido) : null;
            const regionId = normalizedRegionName ? regions?.find((r) => r.name === normalizedRegionName)?.id : undefined;
            if (regionId && customerCities) {
              const matchedCity = customerCities.find((c) => c.name === data.sigungu);
              if (matchedCity) {
                setValue('customerCity', matchedCity.name, { shouldDirty: true, shouldValidate: true });
                setPendingCustomerCity(null);
              } else {
                setValue('customerCity', data.sigungu, { shouldDirty: true, shouldValidate: true });
              }
            } else {
              setValue('customerCity', data.sigungu || '', { shouldDirty: true, shouldValidate: true });
            }
          }

          if (mode === 'create') {
            setSameAsCustomerAddress(true);
          }
          closeCustomerAddressSearch();
        },
        width: '100%',
        height: '100%',
      }).embed(contentElement);
    }, 100);
  }, [closeCustomerAddressSearch, mode, regions, customerCities, setValue, setPendingCustomerCity, setSameAsCustomerAddress]);

  // 상품 선택 drawer 핸들러
  const handleProductSelectDrawerOpen = React.useCallback(() => {
    setProductSelectDrawerOpen(true);
    setSelectedProductForSearch('');
    setSelectedInboundStatus('__all__');
    setBkBlSearch('');
    setContainers([]);
    setAllContainers([]);
    setBlPackingRows([]);
    setRowSelection({});
    setContainerPage(1);
    if (productLineKey === 'bl') {
      setContainerSortBy('bl');
      setContainerSortOrder('asc');
    }
    void fetchContainers(true); // 초기 로드 시에는 로딩 표시
  }, [productLineKey]);

  const handleProductSelectDrawerClose = React.useCallback(() => {
    setProductSelectDrawerOpen(false);
    setSelectedProductForSearch('');
    setSelectedInboundStatus('__all__');
    setBkBlSearch('');
    setContainers([]);
    setAllContainers([]);
    setBlPackingRows([]);
    setRowSelection({});
  }, []);

  // 컨테이너 조회 (컨테이너 단위 API 사용)
  const fetchContainers = React.useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setContainersLoading(true);
      }
      const params: any = {};
      
      // 제품 선택: selectedInboundStatus가 있으면 해당 입고 상태만, 없으면 전체(입고대기/입고예정/입고확정)
      if (selectedInboundStatus && selectedInboundStatus !== '__all__') {
        // 백엔드가 INBOUND_PENDING / INBOUND_SCHEDULED / CONFIRMED 구분 지원
        if (selectedInboundStatus === 'INBOUND_PENDING') {
          params.inboundStatus = 'INBOUND_PENDING';
        } else if (selectedInboundStatus === 'INBOUND_SCHEDULED') {
          params.inboundStatus = 'INBOUND_SCHEDULED';
        } else if (selectedInboundStatus === 'INBOUND_CONFIRMED') {
          params.inboundStatus = 'CONFIRMED';
        }
      }
      // '__all__' 또는 빈 값인 경우 params.inboundStatus를 설정하지 않아 전체 조회
      
      // 제품 선택 화면에서는 모든 중량이 예약되거나 판매된 컨테이너 제외
      params.excludeSoldOut = true;
      // 판매예약 시트(그리드·tb) 차감은 입고 관리 맥락용 — 판매관리 컨 선택 시 가용은 실판매/예약 항목만 반영
      params.includeSheetReservations = false;
      
      // BK, BL 검색 필터 (백엔드 search 파라미터 사용)
      if (bkBlSearch && bkBlSearch.trim()) {
        params.search = bkBlSearch.trim();
      }
      
      // 제품 필터 (백엔드에서 처리)
      if (selectedProductForSearch && selectedProductForSearch.trim()) {
        params.productName = selectedProductForSearch.trim();
      }
      
      const response = await api.get('/trade/contracts/containers', { params });
      const rawContainers: any[] = Array.isArray(response.data) ? response.data : [];
      
      // 컨테이너 데이터 매핑 (컨테이너 단위 API 응답 형식에 맞춤)
      const containerList: SelectedContainer[] = rawContainers.map((c: any) => ({
        id: c.id,
        containerNo: c.containerNo,
        orderId: c.orderId,
        contractNo: c.contractNo ?? null,
        bk: c.bk ?? c.bookingNo ?? null, // BK 번호 추가
        bl: c.bl ?? null, // BL 번호 추가
        packingType: c.packingType ?? null,
        packingName: c.packingName ?? c.packing ?? null,
        sequence: c.sequence ?? null,
        containerType: (c.containerType ?? 'CONTAINER') as 'CONTAINER' | 'CARGO', // 추가 시 기본: 전체 컨테이너
        orderCount: c.orderCount ?? 1,
        productName: c.productName ?? null,
        product: c.product ?? null,
        exporterName: c.exporterName ?? null,
        exportCountryName: c.exportCountryName ?? null,
        tradeGrade: c.tradeGrade ?? null,
        tradeGradeName: c.tradeGradeName ?? null,
        salesGrade: c.salesGrade ?? null,
        salesGradeName: c.salesGradeName ?? null,
        weight: c.weight ? Number(c.weight) : null,
        bales: (c.salesBales ?? c.tradeBales) != null ? Number(c.salesBales ?? c.tradeBales) : null,
        salesBales: c.salesBales != null && c.salesBales !== '' ? Number(c.salesBales) : null,
        tradeBales: c.tradeBales != null && c.tradeBales !== '' ? Number(c.tradeBales) : null,
        availableBales: c.availableBales != null ? Number(c.availableBales) : null,
        soldBales: c.soldBales != null ? Number(c.soldBales) : null,
        availableWeight: c.availableWeight != null ? Number(c.availableWeight) : null,
        soldWeight: c.soldWeight != null ? Number(c.soldWeight) : null,
        unitPrice: null, // 컨테이너 단위 API에서는 제공하지 않음
        etaDate: c.etaDate ?? null,
        warehouseId: c.inboundWarehouse ? (typeof c.inboundWarehouse === 'number' ? c.inboundWarehouse : null) : null, // 창고 ID (코드가 숫자인 경우)
        warehouseName: c.inboundWarehouseName ?? c.inboundWarehouse ?? null, // 창고명 (없으면 코드)
        pendingPurchaseCost: c.pendingPurchaseCost ?? null,
        comparisonPurchaseCost: c.comparisonPurchaseCost != null ? Number(c.comparisonPurchaseCost) : null,
        confirmedPurchaseCost: c.confirmedPurchaseCost ?? null,
        stoCost: c.stoCost != null ? Number(c.stoCost) : null,
        dtCost: c.dtCost != null ? Number(c.dtCost) : null,
        workFee: c.workFee != null ? Number(c.workFee) : null,
        onsiteWorkFee: c.onsiteWorkFee != null ? Number(c.onsiteWorkFee) : null,
        inboundStatus: c.inboundStatus ?? null,
        inventoryStatus: c.inventoryStatus ?? null,
        comparisonExchangeRate: c.comparisonExchangeRate ?? null,
        appliedExchangeRate: c.appliedExchangeRate ?? null,
      }));

      // 입고대기/입고예정/입고확정 모두 선택 가능
      let filteredContainers = [...containerList];

      // 재고 상태 필터 (클라이언트)
      if (selectedInventoryStatus && selectedInventoryStatus !== '__all__') {
        filteredContainers = filteredContainers.filter((c) => c.inventoryStatus === selectedInventoryStatus);
      }

      // ETA 기준 오래된 것부터 정렬
      filteredContainers.sort((a, b) => {
        if (!a.etaDate && !b.etaDate) return 0;
        if (!a.etaDate) return 1;
        if (!b.etaDate) return -1;
        return new Date(a.etaDate).getTime() - new Date(b.etaDate).getTime();
      });

      // 전체 컨테이너 목록 저장 (페이지네이션 전)
      setAllContainers(filteredContainers);
    } catch (error) {
      console.error('컨테이너 조회 오류:', error);
      toast({
        title: '조회 실패',
        description: '컨테이너 목록 조회 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
      setContainers([]);
      setAllContainers([]);
    } finally {
      if (showLoading) {
        setContainersLoading(false);
      }
    }
  }, [selectedInboundStatus, selectedInventoryStatus, selectedProductForSearch, bkBlSearch, toast]);

  // 필터 변경 시 컨테이너 재조회 (로딩 표시 없이)
  React.useEffect(() => {
    if (productSelectDrawerOpen) {
      setContainerPage(1); // 필터 변경 시 첫 페이지로
      void fetchContainers(false); // 필터 변경 시에는 로딩 표시 안 함
    }
  }, [productSelectDrawerOpen, selectedInboundStatus, selectedInventoryStatus, selectedProductForSearch, bkBlSearch, fetchContainers]);

  // 컬럼 정렬 적용한 전체 목록
  const sortedAllContainers = React.useMemo(() => {
    if (allContainers.length === 0) return [];
    const key = containerSortBy;
    const asc = containerSortOrder === 'asc';
    return [...allContainers].sort((a, b) => {
      let aVal: string | number | null | undefined;
      let bVal: string | number | null | undefined;
      switch (key) {
        case 'inboundStatus':
          aVal = a.inboundStatus ?? '';
          bVal = b.inboundStatus ?? '';
          break;
        case 'containerNo':
          aVal = a.containerNo ?? '';
          bVal = b.containerNo ?? '';
          break;
        case 'bl':
          aVal = a.bl ?? '';
          bVal = b.bl ?? '';
          break;
        case 'etaDate':
          aVal = a.etaDate ? new Date(a.etaDate).getTime() : 0;
          bVal = b.etaDate ? new Date(b.etaDate).getTime() : 0;
          return asc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        case 'warehouseName':
          aVal = (a.warehouseName ?? '').toString();
          bVal = (b.warehouseName ?? '').toString();
          break;
        case 'exportCountryName':
          aVal = a.exportCountryName ?? '';
          bVal = b.exportCountryName ?? '';
          break;
        case 'exporterName':
          aVal = a.exporterName ?? '';
          bVal = b.exporterName ?? '';
          break;
        case 'productName':
          aVal = a.productName ?? '';
          bVal = b.productName ?? '';
          break;
        case 'tradeGrade':
          aVal = a.tradeGrade ?? '';
          bVal = b.tradeGrade ?? '';
          break;
        case 'salesGrade':
          aVal = a.salesGrade ?? '';
          bVal = b.salesGrade ?? '';
          break;
        case 'availableWeight':
          aVal = a.availableWeight ?? a.weight ?? 0;
          bVal = b.availableWeight ?? b.weight ?? 0;
          return asc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        case 'availableBales':
          aVal = a.availableBales ?? a.salesBales ?? a.tradeBales ?? 0;
          bVal = b.availableBales ?? b.salesBales ?? b.tradeBales ?? 0;
          return asc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        case 'pendingPurchaseCost':
          aVal = a.pendingPurchaseCost != null ? Number(a.pendingPurchaseCost) : 0;
          bVal = b.pendingPurchaseCost != null ? Number(b.pendingPurchaseCost) : 0;
          return asc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        case 'confirmedPurchaseCost':
          aVal = a.confirmedPurchaseCost != null ? Number(a.confirmedPurchaseCost) : 0;
          bVal = b.confirmedPurchaseCost != null ? Number(b.confirmedPurchaseCost) : 0;
          return asc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        default: {
          const aRaw = (a as unknown as Record<string, unknown>)[key];
          const bRaw = (b as unknown as Record<string, unknown>)[key];
          aVal = aRaw === null || aRaw === undefined ? '' : (typeof aRaw === 'number' ? aRaw : String(aRaw));
          bVal = bRaw === null || bRaw === undefined ? '' : (typeof bRaw === 'number' ? bRaw : String(bRaw));
        }
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      const cmp = aStr.localeCompare(bStr, 'ko');
      return asc ? cmp : -cmp;
    });
  }, [allContainers, containerSortBy, containerSortOrder]);

  const allBlPackingRows = React.useMemo(() => {
    if (!useBlProductLine) return [];
    return groupContainersByBlPacking(allContainers);
  }, [allContainers, useBlProductLine]);

  const sortedAllBlPackingRows = React.useMemo(() => {
    if (!useBlProductLine || allBlPackingRows.length === 0) return [];
    const key = containerSortBy;
    const asc = containerSortOrder === 'asc';
    return [...allBlPackingRows].sort((a, b) => {
      let aVal: string | number | null | undefined;
      let bVal: string | number | null | undefined;
      switch (key) {
        case 'bl':
          aVal = a.bl ?? '';
          bVal = b.bl ?? '';
          break;
        case 'packingName':
          aVal = a.packingName ?? a.packingType ?? '';
          bVal = b.packingName ?? b.packingType ?? '';
          break;
        case 'productName':
          aVal = a.productName ?? '';
          bVal = b.productName ?? '';
          break;
        case 'inboundStatus':
          aVal = a.inboundStatus ?? '';
          bVal = b.inboundStatus ?? '';
          break;
        case 'inventoryStatus':
          aVal = a.inventoryStatus ?? '';
          bVal = b.inventoryStatus ?? '';
          break;
        case 'containerCount':
          return asc ? a.containerCount - b.containerCount : b.containerCount - a.containerCount;
        case 'availableBales':
          return asc ? a.availableBales - b.availableBales : b.availableBales - a.availableBales;
        case 'availableKg':
          return asc ? a.availableKg - b.availableKg : b.availableKg - a.availableKg;
        case 'etaDate':
          aVal = a.etaDate ? new Date(a.etaDate).getTime() : 0;
          bVal = b.etaDate ? new Date(b.etaDate).getTime() : 0;
          return asc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        case 'warehouseName':
          aVal = a.warehouseName ?? '';
          bVal = b.warehouseName ?? '';
          break;
        case 'exportCountryName':
          aVal = a.exportCountryName ?? '';
          bVal = b.exportCountryName ?? '';
          break;
        case 'exporterName':
          aVal = a.exporterName ?? '';
          bVal = b.exporterName ?? '';
          break;
        case 'bk':
          aVal = a.bk ?? '';
          bVal = b.bk ?? '';
          break;
        default: {
          const aRaw = (a as unknown as Record<string, unknown>)[key];
          const bRaw = (b as unknown as Record<string, unknown>)[key];
          aVal = aRaw === null || aRaw === undefined ? '' : String(aRaw);
          bVal = bRaw === null || bRaw === undefined ? '' : String(bRaw);
        }
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      const cmp = aStr.localeCompare(bStr, 'ko');
      return asc ? cmp : -cmp;
    });
  }, [allBlPackingRows, containerSortBy, containerSortOrder, useBlProductLine]);

  // 페이지 또는 페이지 크기 변경 시 페이지네이션된 데이터 업데이트
  React.useEffect(() => {
    if (useBlProductLine) {
      if (sortedAllBlPackingRows.length > 0) {
        const start = (containerPage - 1) * containerPageSize;
        const end = start + containerPageSize;
        setBlPackingRows(sortedAllBlPackingRows.slice(start, end));
      } else {
        setBlPackingRows([]);
      }
      return;
    }
    if (sortedAllContainers.length > 0) {
      const start = (containerPage - 1) * containerPageSize;
      const end = start + containerPageSize;
      const paginatedContainers = sortedAllContainers.slice(start, end);
      setContainers(paginatedContainers);
    } else {
      setContainers([]);
    }
  }, [useBlProductLine, sortedAllBlPackingRows, sortedAllContainers, containerPage, containerPageSize]);

  // 선택 확인
  const handleConfirmSelection = React.useCallback(() => {
    const selectedKeys = Object.keys(rowSelection).filter((key) => rowSelection[key]);
    let selected: SelectedContainer[];
    if (useBlProductLine) {
      const rowMap = new Map(allBlPackingRows.map((r) => [r.rowKey, r]));
      const containerIds = new Set<string>();
      selected = [];
      selectedKeys.forEach((key) => {
        const row = rowMap.get(key);
        if (!row) return;
        row.containers.forEach((c) => {
          const full = allContainers.find((ac) => ac.id === c.id);
          if (full && !containerIds.has(full.id)) {
            containerIds.add(full.id);
            selected.push(full);
          }
        });
      });
    } else {
      selected = containers.filter((c) => selectedKeys.includes(c.id));
    }
    const current = watch('selectedContainers') || [];
    const merged = [...current];
    
    // 중복 제거하며 추가
    // 부분 판매된 컨테이너(availableWeight < weight)는 CARGO로 초기화 → 전체 베일/중량 합계가 실제 판매 기준으로 계산됨
    selected.forEach((newContainer) => {
      if (!merged.find((c) => c.id === newContainer.id)) {
        const fullWeight = newContainer.weight ?? 0;
        const availWeight = newContainer.availableWeight != null ? Number(newContainer.availableWeight) : null;
        const availBales = newContainer.availableBales ?? null;
        const fullBales = newContainer.salesBales ?? newContainer.tradeBales ?? 0;

        let containerToAdd = { ...newContainer };
        if (availWeight != null && availWeight > 0 && fullWeight > 0 && availWeight < fullWeight) {
          containerToAdd.containerType = 'CARGO';
          containerToAdd.cargoWeight = availWeight;
          containerToAdd.cargoBales = availBales ?? fullBales;
        }
        merged.push(containerToAdd);
      }
    });
    
    // 추가 직후 판매 단가·마진·판매가 즉시 계산 (useEffect 타이밍 의존 제거)
    const transportFee = watch('transportFee') ?? 0;
    const totalWeight = merged.reduce((sum, c) => {
      const w = c.containerType === 'CARGO' ? (c.cargoWeight ?? 0) : (c.weight ?? 0);
      return sum + w;
    }, 0);
    const enriched = merged.map((container) => {
      const purchaseCost = container.inboundStatus === 'INBOUND_CONFIRMED'
        ? (container.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : 0)
        : (container.comparisonPurchaseCost != null ? Number(container.comparisonPurchaseCost) : (container.pendingPurchaseCost ? Number(container.pendingPurchaseCost) : 0));
      const currentWeight = container.containerType === 'CARGO' ? (container.cargoWeight ?? 0) : (container.weight ?? 0);
      if (currentWeight === 0 || totalWeight === 0) {
        const salesUnitPrice = container.salesUnitPrice ?? (purchaseCost + (container.margin ?? 0));
        return { ...container, salesUnitPrice, margin: container.margin ?? 0, salesPrice: salesUnitPrice * currentWeight * 1000 };
      }
      const weightRatio = currentWeight / totalWeight;
      const transportFeePerKg = (transportFee * weightRatio) / (currentWeight * 1000);
      const margin = container.margin ?? 0;
      const salesUnitPrice = container.salesUnitPrice ?? (purchaseCost + transportFeePerKg + margin);
      const salesPrice = salesUnitPrice * currentWeight * 1000;
      return { ...container, salesUnitPrice, margin, salesPrice };
    });
    
    setValue('selectedContainers', enriched, { shouldDirty: true });
    handleProductSelectDrawerClose();
    
    toast({
      title: '추가 완료',
      description: useBlProductLine
        ? `${selectedKeys.length}개 BL·패킹(${selected.length}개 컨테이너)이 추가되었습니다.`
        : `${selected.length}개의 컨테이너가 추가되었습니다.`,
    });
  }, [
    containers,
    allContainers,
    allBlPackingRows,
    rowSelection,
    useBlProductLine,
    watch,
    setValue,
    handleProductSelectDrawerClose,
    toast,
  ]);

  // 상품 선택 패널 공통 콘텐츠 (데스크톱 패널 / 모바일 drawer 모두 사용)
  const renderProductSelectContent = () => (
    <>
      <div className="flex flex-col gap-0.5 p-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">상품 선택</h2>
            <p className="text-sm text-muted-foreground">
              {useBlProductLine
                ? 'BL·패킹 단위로 목록이 표시됩니다. 패킹이 다르면 별도 행으로 나옵니다. 판매할 항목을 선택하세요.'
                : '상품을 선택하면 해당 상품의 컨테이너 목록이 표시됩니다. 판매할 컨테이너를 선택하세요.'}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleProductSelectDrawerClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">닫기</span>
          </Button>
        </div>
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-4">
          {containersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {useBlProductLine ? 'BL·패킹 목록 조회 중...' : '컨테이너 목록 조회 중...'}
              </span>
            </div>
          ) : useBlProductLine ? (
            <BlPackingSelectionTable
              rows={blPackingRows}
              salesGradeCodes={(salesGradeCodes || [])
                .filter((c) => c.value && c.name)
                .map((c) => ({ value: c.value!, name: c.name! }))}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              selectedInboundStatus={selectedInboundStatus || '__all__'}
              onInboundStatusChange={(value) => {
                setSelectedInboundStatus(
                  value as 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | '__all__' | '',
                );
              }}
              selectedInventoryStatus={selectedInventoryStatus || '__all__'}
              onInventoryStatusChange={setSelectedInventoryStatus}
              selectedProduct={selectedProductForSearch || ''}
              onProductChange={(value) => {
                setSelectedProductForSearch(value === '__all__' ? '' : value);
              }}
              products={(products || []).map((p) => ({
                id: String(p.id),
                value: p.value ?? null,
                name: p.name ?? null,
              }))}
              bkBlSearch={bkBlSearch}
              setBkBlSearch={setBkBlSearch}
              onSearch={() => void fetchContainers(false)}
              page={containerPage}
              pageSize={containerPageSize}
              total={allBlPackingRows.length}
              totalPages={Math.max(1, Math.ceil(allBlPackingRows.length / containerPageSize))}
              onPageChange={setContainerPage}
              onPageSizeChange={(size) => {
                setContainerPageSize(size);
                setContainerPage(1);
              }}
              sortBy={containerSortBy}
              sortOrder={containerSortOrder}
              onSortChange={(by, order) => {
                setContainerSortBy(by);
                setContainerSortOrder(order);
                setContainerPage(1);
              }}
            />
          ) : (
            <ContainerSelectionTable
              containers={containers}
              gradeCodes={(gradeCodes || []).filter(c => c.value && c.name).map(c => ({ value: c.value!, name: c.name! }))}
              salesGradeCodes={(salesGradeCodes || []).filter(c => c.value && c.name).map(c => ({ value: c.value!, name: c.name! }))}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              selectedInboundStatus={selectedInboundStatus || '__all__'}
              onInboundStatusChange={(value) => {
                setSelectedInboundStatus(value as 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | '__all__' | '');
              }}
              selectedInventoryStatus={selectedInventoryStatus || '__all__'}
              onInventoryStatusChange={setSelectedInventoryStatus}
              selectedProduct={selectedProductForSearch || ''}
              onProductChange={(value) => {
                setSelectedProductForSearch(value === '__all__' ? '' : value);
              }}
              products={(products || []).map(p => ({ id: String(p.id), value: p.value ?? null, name: p.name ?? null }))}
              bkBlSearch={bkBlSearch}
              setBkBlSearch={setBkBlSearch}
              onSearch={() => void fetchContainers(false)}
              page={containerPage}
              pageSize={containerPageSize}
              total={allContainers.length}
              totalPages={Math.max(1, Math.ceil(allContainers.length / containerPageSize))}
              onPageChange={setContainerPage}
              onPageSizeChange={(size) => {
                setContainerPageSize(size);
                setContainerPage(1);
              }}
              sortBy={containerSortBy}
              sortOrder={containerSortOrder}
              onSortChange={(by, order) => {
                setContainerSortBy(by);
                setContainerSortOrder(order);
                setContainerPage(1);
              }}
              productLineKey={productLineKey}
            />
          )}
        </div>
        <div className="mt-auto flex flex-col gap-2 p-4 border-t sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <div className="flex flex-1 items-center sm:justify-start">
            <p className="text-sm text-muted-foreground">
              {Object.keys(rowSelection).filter((key) => rowSelection[key]).length}개 선택됨 (총{' '}
              {useBlProductLine ? allBlPackingRows.length : containers.length}개)
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleProductSelectDrawerClose}>
              <X className="mr-1.5 h-4 w-4" />
              취소
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSelection}
              disabled={Object.keys(rowSelection).filter((key) => rowSelection[key]).length === 0}
            >
              <CheckSquare className="mr-2 h-4 w-4" />
              선택 완료 ({Object.keys(rowSelection).filter((key) => rowSelection[key]).length}개)
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  /**
   * 제출 시 포커스가 아직 입력 필드에 있으면 blur가 발생하지 않아
   * 판매 단가/마진/운송비 등이 폼 state에 반영되지 않을 수 있음.
   * 포커스된 input의 값을 읽어 data에 반영한 뒤 제출에 사용한다.
   */
  const flushFocusedInput = React.useCallback((data: SalesFormData): SalesFormData => {
    if (typeof document === 'undefined') return data;
    const active = document.activeElement as HTMLInputElement | null;
    if (!active?.id || active.tagName !== 'INPUT') return data;

    const raw = (active.value || '').replace(/,/g, '').trim();
    const containers = data.selectedContainers || [];
    const transportFee = data.transportFee ?? 0;

    const getPurchaseCost = (c: SelectedContainer) =>
      c.inboundStatus === 'INBOUND_CONFIRMED'
        ? (c.confirmedPurchaseCost ? Number(c.confirmedPurchaseCost) : 0)
        : (c.comparisonPurchaseCost != null ? Number(c.comparisonPurchaseCost) : (c.pendingPurchaseCost ? Number(c.pendingPurchaseCost) : 0));
    const getCurrentWeight = (c: SelectedContainer) =>
      c.containerType === 'CARGO' ? (c.cargoWeight ?? 0) : (c.weight ?? 0);
    const totalWeight = containers.reduce((s, c) => s + getCurrentWeight(c), 0);
    const getTransportFeePerKg = (c: SelectedContainer) => {
      const w = getCurrentWeight(c);
      if (transportFee <= 0 || totalWeight <= 0 || w <= 0) return 0;
      const ratio = w / totalWeight;
      return (transportFee * ratio) / (w * 1000);
    };
    const calcSalesPrice = (unitPrice: number, weight: number) => unitPrice * weight * 1000;

    // 운송비: 입력값 반영 후 전체 컨테이너 판매단가/마진/판매가 재계산
    if (active.id === 'transportFee') {
      const parsed = raw === '' ? 0 : parseFloat(raw) || 0;
      const newTotalWeight = containers.reduce((s, c) => s + getCurrentWeight(c), 0);
      const updatedContainers = containers.map((container) => {
        const purchaseCost = getPurchaseCost(container);
        const currentWeight = getCurrentWeight(container);
        if (currentWeight === 0 || newTotalWeight === 0) {
          const existingSalesUnitPrice = container.salesUnitPrice ?? null;
          const margin = container.margin ?? 0;
          const salesUnitPrice = existingSalesUnitPrice ?? purchaseCost + margin;
          const salesPrice = calcSalesPrice(salesUnitPrice, currentWeight);
          return { ...container, salesUnitPrice, salesPrice };
        }
        const transportFeePerKg = (parsed * (currentWeight / newTotalWeight)) / (currentWeight * 1000);
        const existingSalesUnitPrice = container.salesUnitPrice ?? null;
        let salesUnitPrice: number;
        let margin: number;
        if (existingSalesUnitPrice != null && existingSalesUnitPrice > 0) {
          salesUnitPrice = existingSalesUnitPrice;
          margin = salesUnitPrice - purchaseCost - transportFeePerKg;
        } else {
          margin = container.margin ?? 0;
          salesUnitPrice = purchaseCost + transportFeePerKg + margin;
        }
        const salesPrice = calcSalesPrice(salesUnitPrice, currentWeight);
        return { ...container, salesUnitPrice, margin, salesPrice };
      });
      return { ...data, transportFee: parsed, selectedContainers: updatedContainers };
    }

    const containerId = active.id.startsWith('salesUnitPrice-')
      ? active.id.slice('salesUnitPrice-'.length)
      : active.id.startsWith('margin-')
        ? active.id.slice('margin-'.length)
        : active.id.startsWith('cargoBales-')
          ? active.id.slice('cargoBales-'.length)
          : active.id.startsWith('cargoWeight-')
            ? active.id.slice('cargoWeight-'.length)
            : null;
    if (!containerId) return data;

    const idx = containers.findIndex((c) => c.id === containerId);
    if (idx === -1) return data;
    const c = containers[idx];
    const purchaseCost = getPurchaseCost(c);
    const currentWeight = getCurrentWeight(c);
    const transportFeePerKg = getTransportFeePerKg(c);

    // 판매 단가: 입력값 → 마진·판매가 계산
    if (active.id.startsWith('salesUnitPrice-')) {
      const salesUnitPrice = parseFloat(raw) || 0;
      const margin = salesUnitPrice - purchaseCost - transportFeePerKg;
      const salesPrice = calcSalesPrice(salesUnitPrice, currentWeight);
      const next = [...containers];
      next[idx] = { ...c, salesUnitPrice, margin, salesPrice };
      return { ...data, selectedContainers: next };
    }

    // 마진: 입력값 → 판매단가·판매가 계산
    if (active.id.startsWith('margin-')) {
      const margin = parseFloat(raw) || 0;
      const salesUnitPrice = purchaseCost + transportFeePerKg + margin;
      const salesPrice = calcSalesPrice(salesUnitPrice, currentWeight);
      const next = [...containers];
      next[idx] = { ...c, margin, salesUnitPrice, salesPrice };
      return { ...data, selectedContainers: next };
    }

    // 카고 베일: 베일만 반영 (중량/마진/판매가는 변경하지 않음, 예상 중량은 참고용)
    if (active.id.startsWith('cargoBales-')) {
      const cargoBales = Math.max(0, parseFloat(raw) || 0);
      const next = [...containers];
      next[idx] = { ...c, cargoBales };
      return { ...data, selectedContainers: next };
    }

    // 카고 중량(kg 표시): 중량만 반영, 베일은 변경하지 않음. 중량에 따라 마진·판매가만 재계산
    if (active.id.startsWith('cargoWeight-')) {
      const valueKg = parseFloat(raw) || 0;
      const cargoWeight = valueKg < 0 ? 0 : valueKg / 1000;
      const allContainersNew = containers.map((orig, i) =>
        i === idx ? { ...orig, cargoWeight } : orig
      );
      const finalTotalWeight = allContainersNew.reduce((s, x) => s + (x.containerType === 'CARGO' ? (x.cargoWeight ?? 0) : (x.weight ?? 0)), 0);
      const salesUnitPrice = c.salesUnitPrice ?? purchaseCost;
      let newMargin = c.margin ?? 0;
      if (transportFee > 0 && finalTotalWeight > 0 && cargoWeight > 0) {
        const weightRatio = cargoWeight / finalTotalWeight;
        const transportFeePerKgNew = (transportFee * weightRatio) / (cargoWeight * 1000);
        newMargin = salesUnitPrice - purchaseCost - transportFeePerKgNew;
      } else {
        newMargin = salesUnitPrice - purchaseCost;
      }
      const salesPrice = salesUnitPrice > 0 && cargoWeight > 0 ? salesUnitPrice * cargoWeight * 1000 : 0;
      const next = [...containers];
      next[idx] = { ...c, cargoWeight, margin: newMargin, salesPrice };
      return { ...data, selectedContainers: next };
    }

    return data;
  }, []);

  const runSubmitAfterValidation = React.useCallback(
    async (data: SalesFormData) => {
      if (onSubmit) {
        let submitData: SalesFormData = mergeCustomerDefaultFromUnloadingForCreate(
          {
            ...data,
            registerAs: registerModeRef.current ?? undefined,
          },
          unloadingAddressChoice,
          customerUpsertBaselineRef.current?.snap ?? null,
        );
        submitData = {
          ...submitData,
          unloadingDeliveryAddressId: unloadingDeliveryAddressIdForApiPayload(unloadingAddressChoice),
        };
        await onSubmit(submitData);
      } else if (mode === 'edit' && salesId) {
        const u = mergeCustomerDefaultFromUnloadingForCreate(
          { ...data },
          unloadingAddressChoice,
          customerUpsertBaselineRef.current?.snap ?? null,
        );
        const payload: UpdateSalesDto = {
          customerId: u.customerId || null,
          phone: u.phone || undefined,
          companyName: u.companyName || undefined,
          ceo: u.ceo || undefined,
          region: u.region || undefined,
          customerPostalCode: u.customerPostalCode || undefined,
          customerAddress: u.customerAddress || undefined,
          customerAddressRoad: u.customerAddressRoad || undefined,
          customerAddressJibun: u.customerAddressJibun || undefined,
          customerLegalBCode: u.customerLegalBCode || undefined,
          customerAddressDefaultType: u.customerAddressDefaultType || undefined,
          customerCity: u.customerCity || undefined,
          addressDetail: u.addressDetail || undefined,
          unloadingPostalCode: u.unloadingPostalCode?.trim() ?? '',
          unloadingAddress: u.unloadingAddress?.trim() ?? '',
          unloadingAddressRoad: u.unloadingAddressRoad?.trim() ?? '',
          unloadingAddressJibun: u.unloadingAddressJibun?.trim() ?? '',
          unloadingLegalBCode:
            u.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) ?? '',
          unloadingAddressDetail: u.unloadingAddressDetail?.trim() ?? '',
          unloadingRegion: u.unloadingRegion?.trim() ?? '',
          unloadingCity: u.unloadingCity?.trim() ?? '',
          unloadingDeliveryAddressId: unloadingDeliveryAddressIdForApiPayload(unloadingAddressChoice),
          reservationDate:
            data.reservationDate && data.reservationDate.trim()
              ? data.reservationDate.trim()
              : data.reservationDate === ''
                ? null
                : undefined,
          salesDate:
            data.salesDate && data.salesDate.trim()
              ? data.salesDate.trim()
              : data.salesDate === ''
                ? null
                : undefined,
          requestVehicle: data.requestVehicle || null,
          transportFee: data.transportFee ?? null,
          advancePaymentRatio: data.advancePaymentRatio ?? null,
          advancePaymentAmount: data.advancePaymentAmount ?? null,
          items: (u.selectedContainers || []).map((container: any, index: number) => {
            const existingItem = salesDetail?.productInfo[index];
            const existingItemId = existingItem?.itemId;
            return {
              id: existingItemId,
              containerId: container.id || container.containerNo || '',
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
              status: container.status ?? null,
            };
          }),
        };
        await updateSalesMutation.mutateAsync({ id: salesId, data: payload });
      } else if (mode === 'confirm' && salesId) {
        const u = mergeCustomerDefaultFromUnloadingForCreate(
          { ...data },
          unloadingAddressChoice,
          customerUpsertBaselineRef.current?.snap ?? null,
        );
        const payload: UpdateSalesDto = {
          customerId: u.customerId || null,
          phone: u.phone || undefined,
          companyName: u.companyName || undefined,
          ceo: u.ceo || undefined,
          region: u.region || undefined,
          customerPostalCode: u.customerPostalCode || undefined,
          customerAddress: u.customerAddress || undefined,
          customerAddressRoad: u.customerAddressRoad || undefined,
          customerAddressJibun: u.customerAddressJibun || undefined,
          customerLegalBCode: u.customerLegalBCode || undefined,
          customerAddressDefaultType: u.customerAddressDefaultType || undefined,
          customerCity: u.customerCity || undefined,
          addressDetail: u.addressDetail || undefined,
          unloadingPostalCode: u.unloadingPostalCode?.trim() ?? '',
          unloadingAddress: u.unloadingAddress?.trim() ?? '',
          unloadingAddressRoad: u.unloadingAddressRoad?.trim() ?? '',
          unloadingAddressJibun: u.unloadingAddressJibun?.trim() ?? '',
          unloadingLegalBCode:
            u.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) ?? '',
          unloadingAddressDetail: u.unloadingAddressDetail?.trim() ?? '',
          unloadingRegion: u.unloadingRegion?.trim() ?? '',
          unloadingCity: u.unloadingCity?.trim() ?? '',
          unloadingDeliveryAddressId: unloadingDeliveryAddressIdForApiPayload(unloadingAddressChoice),
          reservationDate:
            data.reservationDate && data.reservationDate.trim()
              ? data.reservationDate.trim()
              : data.reservationDate === ''
                ? null
                : undefined,
          salesDate:
            data.salesDate && data.salesDate.trim()
              ? data.salesDate.trim()
              : data.salesDate === ''
                ? null
                : undefined,
          requestVehicle: data.requestVehicle || null,
          transportFee: data.transportFee ?? null,
          advancePaymentRatio: data.advancePaymentRatio ?? null,
          advancePaymentAmount: data.advancePaymentAmount ?? null,
          items: (u.selectedContainers || []).map((container: any, index: number) => {
            const existingItem = salesDetail?.productInfo[index];
            const existingItemId = existingItem?.itemId;
            return {
              id: existingItemId,
              containerId: container.id || container.containerNo || '',
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
              status: container.status ?? null,
            };
          }),
        };
        await confirmSalesMutation.mutateAsync({ id: salesId, data: payload });
      }
      onOpenChange(false);
    },
    [
      onSubmit,
      mode,
      salesId,
      salesDetail,
      unloadingAddressChoice,
      updateSalesMutation,
      confirmSalesMutation,
      onOpenChange,
    ],
  );

  const handleCancelCustomerUpsertConfirm = React.useCallback(() => {
    setCustomerUpsertConfirmOpen(false);
    setCustomerUpsertDiffs([]);
    setDeliverySaveConfirmDiffs([]);
    setSaleUnloadingConfirmDiffs([]);
    pendingSubmitAfterCustomerConfirmRef.current = null;
  }, []);

  const handleConfirmCustomerUpsertSubmit = React.useCallback(async () => {
    const pending = pendingSubmitAfterCustomerConfirmRef.current;
    pendingSubmitAfterCustomerConfirmRef.current = null;
    setCustomerUpsertConfirmOpen(false);
    setCustomerUpsertDiffs([]);
    setDeliverySaveConfirmDiffs([]);
    setSaleUnloadingConfirmDiffs([]);
    if (!pending) return;
    setCustomerUpsertConfirmBusy(true);
    try {
      await runSubmitAfterValidation(pending);
    } catch (e: unknown) {
      console.error('저장 오류:', e);
    } finally {
      setCustomerUpsertConfirmBusy(false);
    }
  }, [runSubmitAfterValidation]);

  const onSubmitInternal = async (data: SalesFormData) => {
    try {
      // 입력 후 바로 버튼 클릭 시 blur 미발생으로 인한 미반영 방지: 포커스된 input 값 flush
      const flushedData = flushFocusedInput(data);
      data = flushedData;

      const derivedUnloadingLine = resolveUnloadingLineFromParts({
        unloadingAddressRoad: data.unloadingAddressRoad,
        unloadingAddressJibun: data.unloadingAddressJibun,
        unloadingAddressDefaultType: data.unloadingAddressDefaultType,
      }).trim();
      if (!(data.unloadingAddress || '').trim() && derivedUnloadingLine) {
        data = { ...data, unloadingAddress: derivedUnloadingLine };
      }

      // confirm 모드일 때 판매일 필수 검증
      if (mode === 'confirm' && !data.salesDate) {
        toast({
          title: '입력 오류',
          description: '판매 확정을 위해 판매일을 입력해야 합니다.',
          variant: 'destructive',
        });
        return;
      }

      // 입고 상태에 따른 날짜 필수 검증
      const selectedContainers = data.selectedContainers || [];
      const hasScheduledContainer = selectedContainers.some(
        (c) => c.inboundStatus === 'INBOUND_SCHEDULED'
      );
      const hasOnlyConfirmedContainer = selectedContainers.length > 0 && 
        selectedContainers.every((c) => c.inboundStatus === 'INBOUND_CONFIRMED');
      
      if (hasScheduledContainer && !data.reservationDate) {
        toast({
          title: '입력 오류',
          description: '입고예정 상태의 상품이 있으면 예정일을 입력해야 합니다.',
          variant: 'destructive',
        });
        return;
      }
      
      if (hasOnlyConfirmedContainer && !data.salesDate) {
        toast({
          title: '입력 오류',
          description: '입고확정 상태의 상품만 있으면 판매일을 입력해야 합니다.',
          variant: 'destructive',
        });
        return;
      }

      // 디버깅: 전송되는 데이터 확인
      console.log('[판매 저장] 전송 데이터:', {
        reservationDate: data.reservationDate,
        salesDate: data.salesDate,
        selectedContainersCount: selectedContainers.length,
        hasScheduledContainer,
        hasOnlyConfirmedContainer,
        formValues: watch(),
      });

      const mergedForCustomerCompare: SalesFormData = mergeCustomerDefaultFromUnloadingForCreate(
        { ...data, registerAs: registerModeRef.current ?? data.registerAs ?? undefined },
        unloadingAddressChoice,
        customerUpsertBaselineRef.current?.snap ?? null,
      );

      const upsertBaseline = customerUpsertBaselineRef.current;
      const linkedCustomerId = mergedForCustomerCompare.customerId;

      let customerDiffs: CustomerUpsertDiffRow[] = [];
      if (
        linkedCustomerId &&
        upsertBaseline &&
        upsertBaseline.customerId === linkedCustomerId &&
        (mode === 'create' || mode === 'edit' || mode === 'confirm')
      ) {
        customerDiffs = diffCustomerUpsertFields(
          upsertBaseline.snap,
          pickCustomerUpsertFields(mergedForCustomerCompare),
        );
      }

      const dBaseline = deliveryUnloadingBaselineRef.current;
      let deliveryDiffs: DeliverySaveDiffRow[] = [];
      if (
        dBaseline &&
        unloadingAddressChoice === dBaseline.deliveryId &&
        (mode === 'create' || mode === 'edit' || mode === 'confirm')
      ) {
        deliveryDiffs = diffSelectedDeliveryUnloading(
          dBaseline.snap,
          pickUnloadingSnapForDiff(mergedForCustomerCompare),
        );
      }

      let saleUnloadingDiffRows: DeliverySaveDiffRow[] = [];
      if ((mode === 'edit' || mode === 'confirm') && editSaleUnloadingSnapshotRef.current) {
        saleUnloadingDiffRows = diffSelectedDeliveryUnloading(
          editSaleUnloadingSnapshotToDiffSnap(editSaleUnloadingSnapshotRef.current),
          pickUnloadingSnapForDiff(mergedForCustomerCompare),
        );
        if (
          unloadingAddressChoice === UNLOADING_CHOICE_CUSTOMER_DEFAULT &&
          customerDiffs.length > 0
        ) {
          saleUnloadingDiffRows = [];
        }
      }

      if (customerDiffs.length > 0 || deliveryDiffs.length > 0 || saleUnloadingDiffRows.length > 0) {
        pendingSubmitAfterCustomerConfirmRef.current = data;
        setCustomerUpsertDiffs(customerDiffs);
        setDeliverySaveConfirmDiffs(deliveryDiffs);
        setSaleUnloadingConfirmDiffs(saleUnloadingDiffRows);
        setCustomerUpsertConfirmOpen(true);
        return;
      }

      await runSubmitAfterValidation(data);
    } catch (error: unknown) {
      console.error('저장 오류:', error);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={handleDrawerOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="h-full"
          style={{
            width: isMobile ? '100%' : (productSelectDrawerOpen ? '1900px' : '900px'),
            maxWidth: '95vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        >
          <div className="flex h-full flex-1 min-h-0">
            {/* 상품 선택 패널: drawer 내부에 배치 (이벤트 차단 없음) */}
            {!isMobile && productSelectDrawerOpen && (
              <div className="w-[1000px] flex-shrink-0 border-r flex flex-col bg-background">
                {renderProductSelectContent()}
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <DrawerHeader className="border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DrawerTitle>
                  {mode === 'create' ? '판매 등록' : mode === 'edit' ? '판매 수정' : '판매 확정'}
                </DrawerTitle>
                <DrawerDescription>
                  {mode === 'create' 
                    ? '새로운 판매 정보를 등록합니다.' 
                    : mode === 'edit' 
                    ? '판매 정보를 수정합니다.' 
                    : '판매 정보를 최종 확인하고 확정합니다.'}
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          {(mode === 'edit' || mode === 'confirm') && isSalesDetailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmitInternal)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const target = e.target as HTMLElement;
                  if (target.closest('button[type="submit"]')) return;
                  e.preventDefault();
                }
              }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* 고객 */}
              <section className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">고객</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                      전화번호 또는 업체명으로 검색해 기존 고객을 선택하세요.
                    </p>
                  </div>
                  {watch('customerId') ? (
                    <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
                      <UserCheck className="h-3.5 w-3.5" />
                      고객 연결됨
                    </Badge>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">전화번호</Label>
                    <div className="flex gap-2">
                      <Input
                        id="phone"
                        placeholder="010-1234-5678"
                        {...register('phone')}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => handlePhoneSearchOpenChange(true)}
                        title="전화번호로 검색"
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">업체명 / 농장명</Label>
                    <div className="flex gap-2">
                      <Input
                        id="companyName"
                        placeholder="업체명 또는 농장명"
                        {...register('companyName')}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => handleCompanySearchOpenChange(true)}
                        title="업체명으로 검색"
                      >
                        <Building2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ceo">대표자</Label>
                    <Input id="ceo" placeholder="대표자명" {...register('ceo')} />
                  </div>
                </div>
                {!watchedCustomerId ? (
                  <p className="text-xs text-muted-foreground pt-1">
                    고객을 선택하면 이어서 <span className="text-foreground/90">하차지</span>를 정할 수 있습니다.
                  </p>
                ) : null}
              </section>

              {watchedCustomerId ? (
                <>
                  <Separator />
                  {/* 고객 선택 후에만 하차지 선택·주소 입력 표시 */}
                  <section className="space-y-3">
                    {(mode === 'create' || mode === 'edit' || mode === 'confirm') && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="unloadingAddressChoice" className="text-sm font-semibold text-foreground">
                            하차지
                          </Label>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <div className="min-w-0 flex-1">
                              <Select
                                value={unloadingSelectValue}
                                onValueChange={(v) => {
                                  setUnloadingAddressChoice(v);
                                  if (v === UNLOADING_CHOICE_CUSTOMER_DEFAULT) {
                                    deliveryUnloadingBaselineRef.current = null;
                                    setSameAsCustomerAddress(true);
                                    if (mode === 'edit' || mode === 'confirm') {
                                      handleFillUnloadingFromCustomerDefault();
                                    }
                                    return;
                                  }
                                  if (v === UNLOADING_CHOICE_SALE_SNAPSHOT) {
                                    deliveryUnloadingBaselineRef.current = null;
                                    setSameAsCustomerAddress(false);
                                    const snap = editSaleUnloadingSnapshotRef.current;
                                    if (snap) {
                                      applyEditSaleUnloadingSnapshot(snap, setValue);
                                    }
                                    return;
                                  }
                                  setSameAsCustomerAddress(false);
                                  const row = savedDeliveryAddresses.find((a) => a.id === v);
                                  if (row) {
                                    applyUnloadingFromSavedDeliveryAddress(row, setValue);
                                    queueMicrotask(() => {
                                      deliveryUnloadingBaselineRef.current = {
                                        deliveryId: row.id,
                                        snap: pickUnloadingSnapForDiff(getValues()),
                                      };
                                    });
                                  }
                                }}
                                disabled={savedDeliveryAddressesLoading}
                              >
                                <SelectTrigger id="unloadingAddressChoice" className="h-9 w-full min-w-0">
                                  <SelectValue placeholder="하차지를 선택하세요" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={UNLOADING_CHOICE_CUSTOMER_DEFAULT}>
                                    고객 대표 주소
                                  </SelectItem>
                                  {(mode === 'edit' || mode === 'confirm') && (
                                    <SelectItem
                                      value={UNLOADING_CHOICE_SALE_SNAPSHOT}
                                      className="whitespace-normal py-2"
                                      title="이 판매 DB에 저장된 하차지입니다. 고객 대표·배송지와 다를 때 표시되며, 다른 주소를 골랐다가 다시 불러올 때 사용합니다."
                                    >
                                      이 판매에 저장된 주소
                                    </SelectItem>
                                  )}
                                  {savedDeliveryAddresses.map((row) => (
                                    <SelectItem key={row.id} value={row.id} className="whitespace-normal py-2">
                                      {savedDeliveryAddressLabel(row)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              </div>
                              {savedDeliveryAddressesLoading ? (
                                <Loader2
                                  className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                                  aria-label="배송지 목록 불러오는 중"
                                />
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full shrink-0 gap-1.5 sm:w-auto"
                              onClick={() => setAddDeliveryAddressDialogOpen(true)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              배송지 추가
                            </Button>
                          </div>
                        </div>

                        {showUnloadingAddressNeededHint && (
                          <div className="space-y-3 rounded-md border border-amber-500/45 bg-amber-500/10 px-3 py-3 dark:bg-amber-950/25">
                            <div>
                              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">대표 주소가 아직 비어 있습니다</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                하차지로 고객 대표 주소를 쓰려면 주소 검색으로 채우거나, 배송지를 추가해 선택하세요.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                className="gap-1.5"
                                onClick={() => setAddDeliveryAddressDialogOpen(true)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                배송지 추가
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => handleCustomerAddressSearch()}
                              >
                                <MapPin className="h-3.5 w-3.5" />
                                대표 주소 검색
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
                          <p className="text-xs text-muted-foreground">
                            주소 검색으로 우편번호·도로명·지번을 채울 수 있습니다.
                          </p>
                          <input type="hidden" {...register('unloadingAddress')} />
                          <input type="hidden" {...register('unloadingLegalBCode')} />
                          <input type="hidden" {...register('unloadingAddressDefaultType')} />
                          <div className="w-full space-y-2">
                            <Label htmlFor="unloadingPostalCode">우편번호</Label>
                            <div className="flex w-full min-w-0 items-center">
                              <div className="flex w-1/4 min-w-0 shrink-0 items-center gap-2">
                                <Input
                                  id="unloadingPostalCode"
                                  placeholder="우편번호"
                                  className="h-9 min-w-0 flex-1 text-sm tabular-nums"
                                  {...registerUnloadingWithMark('unloadingPostalCode')}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={handleUnloadingAddressSearch}
                                  className="h-9 w-9 shrink-0"
                                  size="icon"
                                  title="주소검색"
                                >
                                  <MapPin className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="unloadingAddressRoad">도로명 주소</Label>
                              <div
                                className={cn(
                                  'flex min-h-9 w-full min-w-0 overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow]',
                                  'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                                )}
                              >
                                <Input
                                  id="unloadingAddressRoad"
                                  readOnly
                                  placeholder="주소검색 시 입력됩니다"
                                  title="클릭하여 주소 검색"
                                  className={cn(
                                    'h-9 min-w-0 flex-1 cursor-pointer rounded-none border-0 bg-muted text-sm shadow-none',
                                    'focus-visible:ring-0',
                                  )}
                                  onClick={handleUnloadingAddressSearch}
                                  {...registerUnloadingWithMark('unloadingAddressRoad')}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="unloadingAddressJibun">지번 주소</Label>
                              <div
                                className={cn(
                                  'flex min-h-9 w-full min-w-0 overflow-hidden rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow]',
                                  'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
                                )}
                              >
                                <Input
                                  id="unloadingAddressJibun"
                                  readOnly
                                  placeholder="주소검색 시 입력됩니다"
                                  title="클릭하여 주소 검색"
                                  className={cn(
                                    'h-9 min-w-0 flex-1 cursor-pointer rounded-none border-0 bg-muted text-sm shadow-none',
                                    'focus-visible:ring-0',
                                  )}
                                  onClick={handleUnloadingAddressSearch}
                                  {...registerUnloadingWithMark('unloadingAddressJibun')}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="unloadingAddressDetail">상세주소</Label>
                            <Input
                              id="unloadingAddressDetail"
                              placeholder="상세주소"
                              {...registerUnloadingWithMark('unloadingAddressDetail')}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </section>
                </>
              ) : null}

              {/* 예정일/판매일, 요청 차량, 운송비 — 입고대기만 있어도 요청 차량·운송비는 표시 */}
              {(() => {
                const selectedContainers = watch('selectedContainers') || [];
                const hasScheduledContainer = selectedContainers.some(
                  (c) => c.inboundStatus === 'INBOUND_SCHEDULED'
                );
                const hasOnlyConfirmedContainer = selectedContainers.length > 0 && 
                  selectedContainers.every((c) => c.inboundStatus === 'INBOUND_CONFIRMED');
                const showDateAndVehicleBlock =
                  selectedContainers.length > 0 || mode === 'edit' || mode === 'confirm';

                if (!showDateAndVehicleBlock) return null;

                return (
                  <section className="space-y-4 pt-4 border-t">
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {hasScheduledContainer && (
                        <div className="space-y-2">
                          <Label htmlFor="reservationDate">
                            예정일 <span className="text-destructive">*</span>
                          </Label>
                          <DatePicker
                            value={watch('reservationDate') || undefined}
                            onChange={(value) => {
                              const dateValue = value ?? '';
                              setValue('reservationDate', dateValue, { shouldDirty: true, shouldValidate: true });
                              console.log('[예정일 변경]', { value, dateValue, currentFormValue: watch('reservationDate') });
                            }}
                            placeholder="예정일 선택"
                            className="w-full"
                          />
                          {errors.reservationDate && (
                            <p className="text-xs text-destructive">{errors.reservationDate.message}</p>
                          )}
                        </div>
                      )}
                      {(hasOnlyConfirmedContainer || mode === 'confirm') && (
                        <div className="space-y-2">
                          <Label htmlFor="salesDate">
                            판매일 {mode === 'confirm' && <span className="text-destructive">*</span>}
                          </Label>
                          <DatePicker
                            value={watch('salesDate') || undefined}
                            onChange={(value) => {
                              const dateValue = value ?? '';
                              setValue('salesDate', dateValue, { shouldDirty: true, shouldValidate: true });
                              console.log('[판매일 변경]', { value, dateValue, currentFormValue: watch('salesDate') });
                            }}
                            placeholder="판매일 선택"
                            className="w-full"
                          />
                          {errors.salesDate && (
                            <p className="text-xs text-destructive">{errors.salesDate.message}</p>
                          )}
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="requestVehicle">요청 차량</Label>
                        <Select
                          value={requestVehicleSelectValue}
                          onValueChange={(v) => {
                            if (v === '__none__') {
                              setValue('requestVehicle', null, { shouldDirty: true });
                              return;
                            }
                            if (v.startsWith('__legacy__:')) {
                              setValue('requestVehicle', v.slice('__legacy__:'.length), { shouldDirty: true });
                              return;
                            }
                            setValue('requestVehicle', v, { shouldDirty: true });
                          }}
                        >
                          <SelectTrigger id="requestVehicle" className="w-full">
                            <SelectValue placeholder="요청 차량 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">선택 안 함</SelectItem>
                            {requestVehicleRaw && !requestVehicleCodeMatch ? (
                              <SelectItem value={`__legacy__:${requestVehicleRaw}`}>{requestVehicleRaw}</SelectItem>
                            ) : null}
                            {(requestVehicleCodes ?? []).map((code) => {
                              const v = (code.value || code.name || '').trim();
                              if (!v) return null;
                              return (
                                <SelectItem key={v} value={v}>
                                  {code.name || code.value}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="transportFee">운송비</Label>
                        <div className="flex gap-2">
                          <NumberInput
                            id="transportFee"
                            value={watch('transportFee') ?? 0}
                            onChange={handleTransportFeeChange}
                            onBlur={handleTransportFeeBlur}
                            placeholder="운송비 입력"
                            className="flex-1"
                            decimals={0}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setTransportFeeSearchOpen(true)}
                            title="운송비 검색"
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="salesNotes">비고</Label>
                      <Textarea
                        id="salesNotes"
                        value={watch('notes') ?? ''}
                        onChange={(e) => setValue('notes', e.target.value, { shouldDirty: true })}
                        placeholder="운송·하차 시 참고할 내용을 입력하세요"
                        rows={3}
                        className="resize-y min-h-[4.5rem]"
                      />
                      <p className="text-xs text-muted-foreground">
                        운송관리 상세에서도 확인할 수 있습니다.
                      </p>
                    </div>
                  </section>
                );
              })()}

              {/* 선입금 정보 (confirm 모드일 때만 표시) */}
              {mode === 'confirm' && salesDetail?.prepayment && (
                <>
                  <Separator />
                  <section className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">선입금 정보</h3>
                      <p className="text-xs text-muted-foreground">판매 확정 시 선입금이 차감됩니다.</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">청구 금액</span>
                          <span className="text-sm font-medium">
                            {salesDetail.prepayment.prepaymentAmount != null 
                              ? `${formatNumber(salesDetail.prepayment.prepaymentAmount, 0)}원` 
                              : '-'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">상태</span>
                          <Badge
                            variant="outline"
                            className={
                              salesDetail.prepayment.deductionStatus === 'DEDUCTED'
                                ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300'
                                : salesDetail.prepayment.paymentStatus === 'REQUESTED' 
                                ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300'
                                : salesDetail.prepayment.paymentStatus === 'CONFIRMED'
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                                : salesDetail.prepayment.paymentStatus === 'AVAILABLE'
                                ? 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300'
                                : salesDetail.prepayment.paymentStatus === 'CANCELLED'
                                ? 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300'
                                : ''
                            }
                          >
                            {salesDetail.prepayment.deductionStatus === 'DEDUCTED' ? '차감됨'
                              : salesDetail.prepayment.paymentStatus === 'REQUESTED' ? '청구됨' 
                              : salesDetail.prepayment.paymentStatus === 'CONFIRMED' ? '입금확인'
                              : salesDetail.prepayment.paymentStatus === 'AVAILABLE' ? '사용 가능'
                              : salesDetail.prepayment.paymentStatus === 'REFUNDED' ? '환불됨'
                              : salesDetail.prepayment.paymentStatus === 'CANCELLED' ? '취소됨'
                              : salesDetail.prepayment.paymentStatus || '-'}
                          </Badge>
                        </div>
                        {salesDetail.prepayment.actualAmount != null && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">실제 입금액</span>
                            <span className="text-sm font-medium">
                              {formatNumber(salesDetail.prepayment.actualAmount, 0)}원
                            </span>
                          </div>
                        )}
                        {salesDetail.prepayment.differenceAmount != null && salesDetail.prepayment.differenceAmount !== 0 && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">차액</span>
                            <span className={`text-sm font-medium ${
                              salesDetail.prepayment.differenceAmount > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {salesDetail.prepayment.differenceAmount > 0 ? '+' : ''}
                              {formatNumber(salesDetail.prepayment.differenceAmount, 0)}원
                            </span>
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">청구일</span>
                          <span className="text-sm font-medium">
                            {formatDate(salesDetail.prepayment.requestedDate)}
                          </span>
                        </div>
                        {salesDetail.prepayment.confirmedDate && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">입금확인일</span>
                            <span className="text-sm font-medium">
                              {formatDate(salesDetail.prepayment.confirmedDate)}
                            </span>
                          </div>
                        )}
                        {salesDetail.prepayment.paymentMethod && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">입금 방법</span>
                            <span className="text-sm font-medium">
                              {salesDetail.prepayment.paymentMethod}
                            </span>
                          </div>
                        )}
                      </div>
                      {salesDetail.prepayment.notes && (
                        <div className="pt-2 border-t">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">비고</span>
                            <span className="text-sm font-medium">
                              {salesDetail.prepayment.notes}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}

              {/* 상품 정보 */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">상품 정보</h3>
                    <p className="text-xs text-muted-foreground">
                      {useBlProductLine
                        ? '판매할 BL·패킹을 선택해 추가합니다. (패킹이 다르면 별도 항목)'
                        : '판매할 상품을 선택하고 컨테이너를 추가합니다.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleProductSelectDrawerOpen}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    상품 추가
                  </Button>
                </div>

                {/* 선택된 컨테이너 목록 - 카드뷰 */}
                {watch('selectedContainers') && watch('selectedContainers')!.length > 0 && (
                  <div className="space-y-4">
                    <Label>{useBlProductLine ? '선택된 BL·패킹' : '선택된 컨테이너'}</Label>
                    <div className="space-y-3">
                      {(useBlProductLine
                        ? selectedBlPackingGroups.map((group) => ({
                            kind: 'bl' as const,
                            group,
                            key: group.rowKey,
                          }))
                        : (watch('selectedContainers') || []).map((container) => ({
                            kind: 'container' as const,
                            container,
                            key: container.id,
                          }))
                      ).map((entry) => {
                        const blGroup = entry.kind === 'bl' ? entry.group : null;
                        const container =
                          entry.kind === 'bl' ? entry.group.containers[0] : entry.container;
                        const index = 0;
                        // 참조용 남은 수량: 로드 시점 값 캐시(베일/중량 입력 변경 시 동적으로 바뀌지 않음). 카드별(항목별) 키 사용해 같은 컨테이너 여러 항목이어도 각각 정확히 표시
                        // 수정 시: 가용 + 이 건 수량 = 전체 − 다른 판매 (이 건이 해당 컨테이너에서 쓸 수 있는 한도). 추가 시: 가용만 표시
                        const cacheKey = blGroup
                          ? `bl-${blGroup.rowKey}`
                          : container.itemId != null
                            ? `item-${container.itemId}`
                            : container.id;
                        if (!containerRemainingCacheRef.current[cacheKey]) {
                          const groupContainers = blGroup
                            ? (watch('selectedContainers') || []).filter((c) =>
                                blGroup.containers.some((bc) => bc.id === c.id),
                              )
                            : [container];
                          let remainingWeight: number | null = null;
                          let remainingBales: number | null = null;
                          groupContainers.forEach((gc) => {
                            const aw = gc.availableWeight ?? gc.weight ?? null;
                            const ab = gc.availableBales ?? gc.salesBales ?? gc.tradeBales ?? null;
                            if (mode === 'edit') {
                              const cw = gc.cargoWeight != null ? Number(gc.cargoWeight) : 0;
                              const cb = gc.cargoBales != null ? Number(gc.cargoBales) : 0;
                              remainingWeight =
                                (remainingWeight ?? 0) + (aw != null ? aw + cw : 0);
                              remainingBales =
                                (remainingBales ?? 0) + (ab != null ? ab + cb : 0);
                            } else {
                              remainingWeight = (remainingWeight ?? 0) + (aw ?? 0);
                              remainingBales = (remainingBales ?? 0) + (ab ?? 0);
                            }
                          });
                          containerRemainingCacheRef.current[cacheKey] = {
                            remainingWeight,
                            remainingBales,
                          };
                        }
                        const cachedRemaining = containerRemainingCacheRef.current[cacheKey];
                        const status = blGroup?.inboundStatusMixed
                          ? null
                          : (blGroup?.inboundStatus ?? container.inboundStatus);
                        const statusStyles: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
                          INBOUND_PENDING: {
                            variant: 'outline',
                            className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
                          },
                          INBOUND_SCHEDULED: {
                            variant: 'outline',
                            className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
                          },
                          INBOUND_CONFIRMED: {
                            variant: 'outline',
                            className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
                          },
                        };
                        const style = status && statusStyles[status] ? statusStyles[status] : { 
                          variant: 'outline' as const, 
                          className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300' 
                        };
                        const statusLabel = blGroup?.inboundStatusMixed
                          ? '혼합'
                          : status === 'INBOUND_PENDING'
                            ? '입고대기'
                            : status === 'INBOUND_SCHEDULED'
                              ? '입고예정'
                              : status === 'INBOUND_CONFIRMED'
                                ? '입고확정'
                                : '입고대기';
                        
                        const contractNo = container.contractNo || '-';
                        const sequence = container.sequence;
                        const orderCount = container.orderCount ?? 1;
                        const contractDisplay = orderCount > 1 && sequence != null ? `${contractNo} (${sequence})` : contractNo;
                        
                        const updateContainer = (updates: Partial<SelectedContainer>) => {
                          const current = watch('selectedContainers') || [];
                          const transportFee = watch('transportFee') ?? 0;
                          if (blGroup) {
                            const ids = new Set(blGroup.containers.map((c) => c.id));
                            const groupFull = current.filter((c) => ids.has(c.id));
                            const cargoDistribution =
                              updates.cargoBales != null || updates.cargoWeight != null
                                ? distributeBlPackingCargo(
                                    groupFull,
                                    updates.cargoBales ??
                                      groupFull.reduce(
                                        (s, c) => s + (Number(c.cargoBales ?? 0) || 0),
                                        0,
                                      ),
                                    updates.cargoWeight ??
                                      groupFull.reduce(
                                        (s, c) => s + (Number(c.cargoWeight ?? 0) || 0),
                                        0,
                                      ),
                                  )
                                : null;
                            const totalWeight = current.reduce((sum, c) => {
                              const w =
                                c.containerType === 'CARGO' ? (c.cargoWeight ?? 0) : (c.weight ?? 0);
                              return sum + w;
                            }, 0);
                            const updated = current.map((c) => {
                              if (!ids.has(c.id)) return c;
                              const cargoPart = cargoDistribution?.get(c.id);
                              const next = {
                                ...c,
                                ...updates,
                                ...(cargoPart
                                  ? {
                                      cargoBales: cargoPart.cargoBales,
                                      cargoWeight: cargoPart.cargoWeight,
                                      containerType: 'CARGO' as const,
                                    }
                                  : {}),
                              };
                              const purchaseCost =
                                next.inboundStatus === 'INBOUND_CONFIRMED'
                                  ? next.confirmedPurchaseCost
                                    ? Number(next.confirmedPurchaseCost)
                                    : 0
                                  : next.comparisonPurchaseCost != null
                                    ? Number(next.comparisonPurchaseCost)
                                    : next.pendingPurchaseCost
                                      ? Number(next.pendingPurchaseCost)
                                      : 0;
                              const currentWeight =
                                next.containerType === 'CARGO'
                                  ? (next.cargoWeight ?? 0)
                                  : (next.weight ?? 0);
                              let margin = next.margin ?? 0;
                              let salesUnitPrice = next.salesUnitPrice ?? purchaseCost + margin;
                              if (currentWeight > 0 && totalWeight > 0) {
                                const weightRatio = currentWeight / totalWeight;
                                const transportFeePerKg =
                                  (transportFee * weightRatio) / (currentWeight * 1000);
                                if (updates.salesUnitPrice != null) {
                                  margin = salesUnitPrice - purchaseCost - transportFeePerKg;
                                } else if (updates.margin != null) {
                                  salesUnitPrice = purchaseCost + transportFeePerKg + margin;
                                }
                              }
                              const salesPrice =
                                salesUnitPrice > 0 && currentWeight > 0
                                  ? salesUnitPrice * currentWeight * 1000
                                  : 0;
                              return { ...next, margin, salesUnitPrice, salesPrice };
                            });
                            setValue('selectedContainers', updated, { shouldDirty: true });
                            return;
                          }
                          const updated = current.map((c) =>
                            c.id === container.id ? { ...c, ...updates } : c,
                          );
                          setValue('selectedContainers', updated, { shouldDirty: true });
                        };
                        
                        return (
                          <Card key={entry.key} className="relative py-0">
                            <CardContent className="p-4">
                              {/* 컨테이너 정보 2줄 */}
                              <div className="space-y-2 mb-3">
                                {/* 첫 번째 줄: 입고확정, 컨테이너 */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Badge variant={style.variant} className={`text-xs flex-shrink-0 ${style.className || ''}`}>
                                      {statusLabel}
                                    </Badge>
                                    <span className="text-sm font-medium truncate">
                                      {blGroup ? (
                                        <>
                                          {blGroup.bl || blGroup.bk || '-'}
                                          <span className="ml-1.5 font-normal text-muted-foreground">
                                            · {blGroup.packingName || blGroup.packingType || '패킹 미지정'}
                                            · {blGroup.containerCount}컨
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          {container.containerNo}
                                          {container.sequence != null && ` [${container.sequence}]`}
                                        </>
                                      )}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 flex-shrink-0"
                                    onClick={() => {
                                      const current = watch('selectedContainers') || [];
                                      if (blGroup) {
                                        const ids = new Set(blGroup.containers.map((c) => c.id));
                                        setValue(
                                          'selectedContainers',
                                          current.filter((c) => !ids.has(c.id)),
                                          { shouldDirty: true },
                                        );
                                      } else {
                                        setValue(
                                          'selectedContainers',
                                          current.filter((c) => c.id !== container.id),
                                          { shouldDirty: true },
                                        );
                                      }
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                                  {!blGroup ? (
                                    <>
                                      <span className="text-sm text-muted-foreground truncate">
                                        BL: {container.bl || '-'}
                                      </span>
                                      <span className="text-xs text-muted-foreground">·</span>
                                    </>
                                  ) : null}
                                  <span className="text-sm text-muted-foreground truncate">
                                    계약번호: {contractDisplay}
                                  </span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-sm text-muted-foreground truncate">
                                    {getProductName(
                                      (blGroup?.productName ?? container.productName ?? container.product) || '',
                                    ) || '-'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-sm text-muted-foreground">
                                    ETA:{' '}
                                    {blGroup?.etaDateMixed
                                      ? '혼합'
                                      : (blGroup?.etaDate ?? container.etaDate)
                                        ? (() => {
                                            const d = new Date(
                                              (blGroup?.etaDate ?? container.etaDate)!,
                                            );
                                            return `${String(d.getFullYear()).slice(-2)}. ${d.getMonth() + 1}. ${d.getDate()}.`;
                                          })()
                                        : '-'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-sm text-muted-foreground truncate">
                                    창고:{' '}
                                    {blGroup?.warehouseMixed
                                      ? '혼합'
                                      : blGroup?.warehouseName ?? container.warehouseName ?? '-'}
                                  </span>
                                </div>
                                {/* 세 번째 줄: 등급(영업만), 중량, 베일, 환율, 확정원가/운송비/실제원가 */}
                                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                                  <span className="text-sm text-muted-foreground">
                                    등급: {salesGradeCodes?.find((c) => c.value === container.salesGrade)?.name || container.salesGrade || '-'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span
                                    className="text-sm text-muted-foreground"
                                    title={
                                      blGroup
                                        ? 'BL·패킹 합계: 남은/전체 베일 (참조용)'
                                        : '해당 컨테이너: 남은 수량(이 건 포함) / 전체. 참조용이며 베일/중량 입력 변경 시 바뀌지 않음'
                                    }
                                  >
                                    베일(남은/전체): {(() => {
                                      const totalBales = blGroup
                                        ? blGroup.totalBales
                                        : (container.salesBales ?? container.tradeBales ?? null);
                                      const cargoBales = blGroup
                                        ? blGroup.containers.reduce(
                                            (s, c) => s + (Number(c.cargoBales ?? 0) || 0),
                                            0,
                                          )
                                        : container.cargoBales != null
                                          ? Number(container.cargoBales)
                                          : 0;
                                      const soldBales = blGroup ? blGroup.soldBales : (container.soldBales ?? null);
                                      const hasSales = (soldBales ?? 0) > 0;
                                      const displayRemaining = blGroup
                                        ? blGroup.availableBales
                                        : (cachedRemaining.remainingBales ?? totalBales);
                                      
                                      if (totalBales == null) return '-';
                                      if (hasSales || cargoBales > 0) {
                                        return (
                                          <span>
                                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                                              {Math.round(displayRemaining ?? 0).toLocaleString('ko-KR')}
                                            </span>
                                            <span className="text-muted-foreground">/</span>
                                            <span className="text-xs text-muted-foreground">
                                              {Math.round(totalBales).toLocaleString('ko-KR')}
                                            </span>
                                          </span>
                                        );
                                      }
                                      return <span>{Math.round(totalBales).toLocaleString('ko-KR')} <span className="text-xs">(전체)</span></span>;
                                    })()}
                                  </span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span
                                    className="text-sm text-muted-foreground"
                                    title={
                                      blGroup
                                        ? 'BL·패킹 합계: 남은/전체 중량 (참조용)'
                                        : '해당 컨테이너: 남은 수량(이 건 포함) / 전체. 참조용이며 베일/중량 입력 변경 시 바뀌지 않음'
                                    }
                                  >
                                    중량(남은/전체): {(() => {
                                      const totalKg = blGroup
                                        ? blGroup.totalKg
                                        : container.weight != null
                                          ? (container.weight ?? 0) * 1000
                                          : null;
                                      const cargoKg = blGroup
                                        ? blGroup.containers.reduce(
                                            (s, c) => s + (Number(c.cargoWeight ?? 0) || 0) * 1000,
                                            0,
                                          )
                                        : container.cargoWeight != null
                                          ? Number(container.cargoWeight) * 1000
                                          : 0;
                                      const soldKg = blGroup ? blGroup.soldKg : (container.soldWeight ?? 0) * 1000;
                                      const hasSales = (soldKg ?? 0) > 0;
                                      const displayRemainingKg = blGroup
                                        ? blGroup.availableKg
                                        : (cachedRemaining.remainingWeight ?? 0) * 1000;

                                      if (totalKg == null) return '-';
                                      if (hasSales || cargoKg > 0) {
                                        return (
                                          <span>
                                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                                              {Math.round(displayRemainingKg ?? 0).toLocaleString('ko-KR')}
                                            </span>
                                            <span className="text-muted-foreground">/</span>
                                            <span className="text-xs text-muted-foreground">
                                              {Math.round(totalKg).toLocaleString('ko-KR')}
                                            </span>
                                            <span className="text-xs text-muted-foreground"> KG</span>
                                          </span>
                                        );
                                      }
                                      return (
                                        <span>
                                          {Math.round(totalKg).toLocaleString('ko-KR')} KG{' '}
                                          <span className="text-xs">(전체)</span>
                                        </span>
                                      );
                                    })()}
                                  </span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-sm text-muted-foreground">
                                    환율: {
                                      container.inboundStatus === 'INBOUND_CONFIRMED'
                                        ? (container.appliedExchangeRate ? parseFloat(Number(container.appliedExchangeRate).toFixed(6)).toLocaleString('ko-KR') : '-')
                                        : (container.comparisonExchangeRate ? parseFloat(Number(container.comparisonExchangeRate).toFixed(6)).toLocaleString('ko-KR') : '-')
                                    }
                                  </span>
                                </div>
                                {/* 네 번째 줄: 확정원가, 운송비, 실제원가 */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(() => {
                                    const purchaseCost = container.inboundStatus === 'INBOUND_CONFIRMED'
                                      ? (container.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : 0)
                                      : (container.comparisonPurchaseCost != null ? Number(container.comparisonPurchaseCost) : (container.pendingPurchaseCost ? Number(container.pendingPurchaseCost) : 0));
                                    const currentWeight = container.containerType === 'CARGO'
                                      ? (container.cargoWeight ?? 0)
                                      : (container.weight ?? 0);
                                    const transportFee = watch('transportFee') ?? 0;
                                    const allContainers = watch('selectedContainers') || [];
                                    const totalWeight = allContainers.reduce((sum, c) => {
                                      const w = c.containerType === 'CARGO' ? (c.cargoWeight ?? 0) : (c.weight ?? 0);
                                      return sum + w;
                                    }, 0);
                                    let transportFeePerKg = 0;
                                    if (transportFee > 0 && totalWeight > 0 && currentWeight > 0) {
                                      const weightRatio = currentWeight / totalWeight;
                                      transportFeePerKg = (transportFee * weightRatio) / (currentWeight * 1000);
                                    }
                                    const actualCost = purchaseCost + transportFeePerKg;
                                    return (
                                      <>
                                        <span className="text-sm text-muted-foreground">
                                          {container.inboundStatus === 'INBOUND_CONFIRMED' ? '확정원가' : '예정원가'}:
                                        </span>
                                        <span className={`text-sm font-medium ${recalculatingCosts.has(container.id) ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                                          {purchaseCost > 0 ? purchaseCost.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                        </span>
                                        {recalculatingCosts.has(container.id) && <Loader2 className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />}
                                        <span className="text-xs text-muted-foreground">·</span>
                                        <span className="text-sm text-muted-foreground">운송비:</span>
                                        <span className="text-sm font-medium">
                                          {transportFeePerKg > 0 ? transportFeePerKg.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                        </span>
                                        <span className="text-xs text-muted-foreground">·</span>
                                        <span className="text-sm font-semibold text-primary">실제원가:</span>
                                        <span className="text-sm font-semibold text-primary">
                                          {actualCost.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                              
                              {/* 판매 정보 입력 폼 */}
                              <div className="space-y-3 pt-3 border-t">
                                {/* 첫 번째 줄: 타입, 카고 정보, 판매 단가, 마진, 선입금 비율 */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div className="space-y-1">
                                    <Label htmlFor={`containerType-${container.id}`} className="text-xs">타입</Label>
                                    {(() => {
                                      // 이미 일부가 판매된 경우 (soldBales > 0 또는 soldWeight > 0)
                                      const hasPartialSales = blGroup
                                        ? blGroup.containers.some(
                                            (c) => (c.soldBales ?? 0) > 0 || (c.soldWeight ?? 0) > 0,
                                          )
                                        : (container.soldBales ?? 0) > 0 || (container.soldWeight ?? 0) > 0;
                                      
                                      // 이미 일부가 판매된 경우 카고만 선택 가능
                                      if (hasPartialSales) {
                                        // 강제로 카고 타입으로 설정
                                        if (container.containerType !== 'CARGO') {
                                          updateContainer({ containerType: 'CARGO' });
                                        }
                                        
                                        return (
                                          <Select
                                            value="CARGO"
                                            disabled={true}
                                          >
                                            <SelectTrigger id={`containerType-${container.id}`} className="h-8 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="CARGO">카고</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        );
                                      }
                                      
                                      // 전체가 있는 경우 컨테이너/카고 선택 가능
                                      return (
                                        <Select
                                          value={container.containerType || 'CONTAINER'}
                                          onValueChange={(value) => {
                                            const newContainerType = value as 'CONTAINER' | 'CARGO';
                                            
                                            // 카고 타입으로 변경할 때 cargoWeight가 없으면 availableWeight(부분 판매 시) 또는 weight를 기본값으로 설정
                                            let cargoWeight = container.cargoWeight;
                                            let cargoBales = container.cargoBales;
                                            
                                            if (newContainerType === 'CARGO' && !cargoWeight && container.weight) {
                                              // 부분 판매된 컨테이너는 availableWeight(톤) 우선, 없으면 전체 weight
                                              const availW = container.availableWeight != null ? Number(container.availableWeight) : null;
                                              cargoWeight = (availW != null && availW > 0 && availW < (container.weight ?? 0))
                                                ? availW
                                                : (container.weight ?? 0);
                                              // 베일 수도 설정 (있는 경우)
                                              const availB = container.availableBales ?? container.salesBales ?? container.tradeBales;
                                              if (availB != null && !cargoBales) {
                                                cargoBales = availB;
                                              } else if ((container.salesBales ?? container.tradeBales) != null && !cargoBales) {
                                                cargoBales = container.salesBales ?? container.tradeBales;
                                              }
                                            }
                                            
                                            // 중량 결정 (타입에 따라)
                                            const currentWeight = newContainerType === 'CARGO'
                                              ? (cargoWeight ?? 0)  // 카고일 때는 설정한 중량만 사용
                                              : (container.weight ?? 0);      // 컨테이너일 때는 전체 중량 사용
                                            
                                            // 원가 결정: 확정이면 확정원가, 예정이면 원화(comparisonPurchaseCost) 우선
                                            const purchaseCost = container.inboundStatus === 'INBOUND_CONFIRMED'
                                              ? (container.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : 0)
                                              : (container.comparisonPurchaseCost != null ? Number(container.comparisonPurchaseCost) : (container.pendingPurchaseCost ? Number(container.pendingPurchaseCost) : 0));
                                            
                                            // 마진 유지 (기존 마진이 있으면 사용, 없으면 0)
                                            const margin = container.margin ?? 0;
                                            
                                            // 운송비 가져오기
                                            const transportFee = watch('transportFee') ?? 0;
                                            const allContainers = watch('selectedContainers') || [];
                                            
                                            // 전체 중량 합계 계산 (운송비 분배를 위해)
                                            const totalWeight = allContainers.reduce((sum, c) => {
                                              const w = c.id === container.id
                                                ? currentWeight  // 현재 변경 중인 컨테이너는 새로운 중량 사용
                                                : (c.containerType === 'CARGO'
                                                  ? (c.cargoWeight ?? 0)
                                                  : (c.weight ?? 0));
                                              return sum + w;
                                            }, 0);
                                            
                                            let newSalesUnitPrice = purchaseCost + margin;
                                            let newSalesPrice = 0;
                                            
                                            if (transportFee > 0 && totalWeight > 0 && currentWeight > 0) {
                                              // 운송비가 있으면 판매 단가 재계산
                                              // 운송비를 중량 비례 분배
                                              const weightRatio = currentWeight / totalWeight;
                                              const allocatedTransportFee = transportFee * weightRatio;
                                              
                                              // kg당 운송비 = 분배된 운송비 / (중량(톤) * 1000)
                                              const transportFeePerKg = allocatedTransportFee / (currentWeight * 1000);
                                              
                                              // 판매단가 = 원가 + (kg당 운송비) + 마진
                                              newSalesUnitPrice = purchaseCost + transportFeePerKg + margin;
                                            }
                                            
                                            // 판매가 = 판매단가 * 중량(톤) * 1000
                                            newSalesPrice = newSalesUnitPrice > 0 && currentWeight > 0 ? newSalesUnitPrice * currentWeight * 1000 : 0;
                                            
                                            // 업데이트할 데이터 준비
                                            const updates: Partial<SelectedContainer> = {
                                              containerType: newContainerType,
                                              salesUnitPrice: newSalesUnitPrice,
                                              salesPrice: newSalesPrice
                                            };
                                            
                                            if (newContainerType === 'CARGO') {
                                              // 카고로 변경 시: cargoWeight/cargoBales 설정 (없으면 available/전체로 채움)
                                              if (cargoWeight !== undefined) {
                                                updates.cargoWeight = cargoWeight;
                                              }
                                              if (cargoBales !== undefined) {
                                                updates.cargoBales = cargoBales;
                                              }
                                            } else {
                                              // 컨테이너로 변경 시: 베일·중량은 전체 컨테이너 기준이 되므로 cargo 값 초기화
                                              updates.cargoWeight = null;
                                              updates.cargoBales = null;
                                            }
                                            
                                            updateContainer(updates);
                                          }}
                                        >
                                          <SelectTrigger id={`containerType-${container.id}`} className="h-8 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="CONTAINER">컨테이너</SelectItem>
                                            <SelectItem value="CARGO">카고</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      );
                                    })()}
                                  </div>
                                  
                                  {container.containerType === 'CARGO' && (() => {
                                    const groupCargoBales = blGroup
                                      ? blGroup.containers.reduce(
                                          (s, c) => s + (Number(c.cargoBales ?? 0) || 0),
                                          0,
                                        )
                                      : null;
                                    const groupCargoWeight = blGroup
                                      ? blGroup.containers.reduce(
                                          (s, c) => s + (Number(c.cargoWeight ?? 0) || 0),
                                          0,
                                        )
                                      : null;
                                    const availableBales = blGroup
                                      ? blGroup.availableBales
                                      : (container.availableBales ??
                                        container.salesBales ??
                                        container.tradeBales ??
                                        0);
                                    const availableWeight = blGroup
                                      ? blGroup.availableKg / 1000
                                      : (container.availableWeight ?? container.weight ?? 0);
                                    const totalBales = blGroup
                                      ? blGroup.totalBales
                                      : (container.salesBales ?? container.tradeBales ?? 0);
                                    const totalWeight = blGroup
                                      ? blGroup.totalKg / 1000
                                      : (container.weight ?? 0);
                                    const weightPerBale = totalBales > 0 ? totalWeight / totalBales : 0;
                                    
                                    return (
                                      <>
                                        <div className="space-y-1">
                                          <Label htmlFor={`cargoBales-${container.id}`} className="text-xs" title="이 판매 건에서 선택한(판매할) 베일 수">
                                            카고 베일
                                            {weightPerBale > 0 && (container.cargoBales ?? 0) > 0 && (
                                              <span className="text-muted-foreground font-normal">
                                                {' '}(예상 중량: {Math.round((Number(container.cargoBales ?? 0) * weightPerBale) * 1000).toLocaleString('ko-KR')} kg)
                                              </span>
                                            )}
                                          </Label>
                                          <NumberInput
                                            id={`cargoBales-${entry.key}`}
                                            value={
                                              groupCargoBales ??
                                              container.cargoBales ??
                                              (availableBales > 0
                                                ? availableBales
                                                : (container.salesBales ?? container.tradeBales ?? 0))
                                            }
                                            onChange={() => {
                                              // onChange에서는 아무것도 하지 않음 (blur에서 처리)
                                            }}
                                            onBlur={(e) => {
                                              const value = parseFloat(e.target.value.replace(/,/g, '')) || 0;
                                              const cargoBales = value < 0 ? 0 : value;
                                              updateContainer({ cargoBales, containerType: 'CARGO' });
                                            }}
                                            decimals={2}
                                            className="h-8 text-xs"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label htmlFor={`cargoWeight-${container.id}`} className="text-xs" title="이 판매 건에서 선택한(판매할) 중량">
                                            카고 중량 KG
                                            {weightPerBale > 0 && (container.cargoWeight ?? 0) > 0 && (
                                              <span className="text-muted-foreground font-normal">
                                                {' '}(예상 베일: 약 {(() => {
                                                  const w = container.cargoWeight ?? 0;
                                                  const b = w / weightPerBale;
                                                  return b % 1 === 0 ? b.toLocaleString('ko-KR') : b.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
                                                })()})
                                              </span>
                                            )}
                                          </Label>
                                          <NumberInput
                                            id={`cargoWeight-${entry.key}`}
                                            value={
                                              (groupCargoWeight ??
                                                container.cargoWeight ??
                                                (availableWeight > 0
                                                  ? availableWeight
                                                  : (container.weight ?? 0))) * 1000
                                            }
                                            onChange={() => {
                                              // onChange에서는 아무것도 하지 않음 (blur에서 처리)
                                            }}
                                            onBlur={(e) => {
                                              const valueKg = parseFloat(e.target.value.replace(/,/g, '')) || 0;
                                              const cargoWeight = valueKg < 0 ? 0 : valueKg / 1000;
                                              updateContainer({ cargoWeight, containerType: 'CARGO' });
                                            }}
                                            decimals={3}
                                            className="h-8 text-xs"
                                          />
                                        </div>
                                      </>
                                    );
                                  })()}
                                  
                                </div>
                                
                                {/* 두 번째 줄: 마진, 판매단가, 선입금 비율 */}
                                {(() => {
                                  // 원가 결정: 확정원가가 있으면 확정원가, 없으면 예정원가 사용
                                  const purchaseCost = container.confirmedPurchaseCost
                                    ? Number(container.confirmedPurchaseCost)
                                    : (container.comparisonPurchaseCost != null ? Number(container.comparisonPurchaseCost) : (container.pendingPurchaseCost ? Number(container.pendingPurchaseCost) : 0));
                                  
                                  // 중량 결정
                                  // 컨테이너일 때: 전체 중량(weight) 사용
                                  // 카고일 때: 설정한 중량(cargoWeight) 사용
                                  const currentWeight = container.containerType === 'CARGO'
                                    ? (container.cargoWeight ?? 0)  // 카고일 때는 설정한 중량만 사용
                                    : (container.weight ?? 0);      // 컨테이너일 때는 전체 중량 사용
                                  
                                  // 운송비 가져오기
                                  const transportFee = watch('transportFee') ?? 0;
                                  
                                  // 전체 중량 합계 계산 (운송비 분배를 위해)
                                  // 컨테이너일 때: 전체 중량(weight) 사용
                                  // 카고일 때: 설정한 중량(cargoWeight) 사용
                                  const allContainers = watch('selectedContainers') || [];
                                  const totalWeight = allContainers.reduce((sum, c) => {
                                    const w = c.containerType === 'CARGO'
                                      ? (c.cargoWeight ?? 0)  // 카고일 때는 설정한 중량만 사용
                                      : (c.weight ?? 0);      // 컨테이너일 때는 전체 중량 사용
                                    return sum + w;
                                  }, 0);
                                  
                                  // 운송비를 중량 비례 분배 (kg당 운송비 계산)
                                  const weightRatio = totalWeight > 0 && currentWeight > 0 ? currentWeight / totalWeight : 0;
                                  const allocatedTransportFee = transportFee * weightRatio;
                                  const transportFeePerKg = currentWeight > 0 ? allocatedTransportFee / (currentWeight * 1000) : 0;
                                  
                                  // 판매가 계산 함수
                                  const calculateSalesPrice = (unitPrice: number, weight: number) => {
                                    return unitPrice * weight * 1000;
                                  };
                                  
                                  return (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                      <div className="space-y-1">
                                        <Label htmlFor={`salesUnitPriceStage-${container.id}`} className="text-xs">구분</Label>
                                        <Select
                                          value={container.salesUnitPriceStage ?? ''}
                                          onValueChange={(value) => updateContainer({ salesUnitPriceStage: value || null })}
                                        >
                                          <SelectTrigger id={`salesUnitPriceStage-${container.id}`} className="h-8 text-xs">
                                            <SelectValue placeholder="구분 선택" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(salesPriceStageCodes ?? []).map((code) => (
                                              <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                                                {code.name || code.value}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      
                                      <div className="space-y-1">
                                        <Label htmlFor={`salesUnitPrice-${container.id}`} className="text-xs">판매 단가</Label>
                                        <NumberInput
                                          id={`salesUnitPrice-${container.id}`}
                                          value={container.salesUnitPrice ?? (purchaseCost + transportFeePerKg)}
                                          onChange={() => {
                                            // onChange에서는 아무것도 하지 않음 (blur에서 처리)
                                          }}
                                          onBlur={(e) => {
                                            const value = parseFloat(e.target.value.replace(/,/g, '')) || 0;
                                            const salesUnitPrice = value;
                                            // 마진 = 판매단가 - 원가 - (kg당 운송비)
                                            const margin = salesUnitPrice - purchaseCost - transportFeePerKg;
                                            // 판매가 = 판매단가 * 중량(톤) * 1000
                                            const salesPrice = calculateSalesPrice(salesUnitPrice, currentWeight);
                                            updateContainer({ salesUnitPrice, margin, salesPrice });
                                          }}
                                          decimals={2}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                      
                                      <div className="space-y-1">
                                        <Label htmlFor={`margin-${container.id}`} className="text-xs">마진</Label>
                                        <NumberInput
                                          id={`margin-${container.id}`}
                                          value={container.margin ?? 0}
                                          onChange={() => {
                                            // onChange에서는 아무것도 하지 않음 (blur에서 처리)
                                          }}
                                          onBlur={(e) => {
                                            const value = parseFloat(e.target.value.replace(/,/g, '')) || 0;
                                            const margin = value;
                                            // 판매단가 = 원가 + (kg당 운송비) + 마진
                                            const salesUnitPrice = purchaseCost + transportFeePerKg + margin;
                                            // 판매가 = 판매단가 * 중량(톤) * 1000
                                            const salesPrice = calculateSalesPrice(salesUnitPrice, currentWeight);
                                            updateContainer({ margin, salesUnitPrice, salesPrice });
                                          }}
                                          decimals={2}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                      
                                      {/* 선입금 비율 입력 제거 - 판매 전체 기준으로 변경 */}
                                    </div>
                                  );
                                })()}
                                
                                {/* 세 번째 줄: STO, DT, 창고/현장 작업비 (확정 재고일 때만 표시) */}
                                {container.inboundStatus === 'INBOUND_CONFIRMED' && (
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
                                    <div className="space-y-1">
                                      <Label htmlFor={`stoCost-${container.id}`} className="text-xs">STO 비용</Label>
                                      <NumberInput
                                        id={`stoCost-${container.id}`}
                                        value={container.stoCost ?? 0}
                                        onChange={(value) => updateContainer({ stoCost: value ?? 0 })}
                                        decimals={2}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                    
                                    <div className="space-y-1">
                                      <Label htmlFor={`dtCost-${container.id}`} className="text-xs">DT 비용</Label>
                                      <NumberInput
                                        id={`dtCost-${container.id}`}
                                        value={container.dtCost ?? 0}
                                        onChange={(value) => updateContainer({ dtCost: value ?? 0 })}
                                        decimals={2}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                    
                                    <div className="space-y-1">
                                      <Label htmlFor={`workFee-${container.id}`} className="text-xs">창고 작업비</Label>
                                      <NumberInput
                                        id={`workFee-${container.id}`}
                                        value={container.workFee ?? 0}
                                        onChange={(value) => updateContainer({ workFee: value ?? 0 })}
                                        decimals={2}
                                        className="h-8 text-xs"
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <Label htmlFor={`onsiteWorkFee-${container.id}`} className="text-xs">현장 작업비</Label>
                                      <NumberInput
                                        id={`onsiteWorkFee-${container.id}`}
                                        value={container.onsiteWorkFee ?? 0}
                                        onChange={(value) => updateContainer({ onsiteWorkFee: value ?? 0 })}
                                        decimals={2}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                    
                                    {/* STO, DT, 창고·현장 작업비 저장 및 원가 재계산 */}
                                    <div>
                                      <Button
                                        type="button"
                                        variant="default"
                                        size="sm"
                                        onClick={async () => {
                                          try {
                                            setRecalculatingCosts((prev) => new Set(prev).add(container.id));
                                            
                                            // 1. STO, DT, 창고·현장 작업비 저장
                                            await api.patch(`/trade/contracts/containers/${container.id}`, {
                                              stoCost: container.stoCost ?? 0,
                                              dtCost: container.dtCost ?? 0,
                                              workFee: container.workFee ?? 0,
                                              onsiteWorkFee: container.onsiteWorkFee ?? 0,
                                            });
                                            
                                            // 2. 원가 재계산
                                            const response = await api.post(`/trade/contracts/containers/${container.id}/recalculate-cost`);
                                            
                                            // 재계산된 원가를 받아서 업데이트
                                            const recalculatedCost = response.data.confirmedPurchaseCost;
                                            const recalculatedCostNum = Number(recalculatedCost);
                                            
                                            // 판매 단가가 있으면 마진·판매가도 재계산
                                            const updates: Partial<typeof container> = { confirmedPurchaseCost: recalculatedCost };
                                            const salesUnitPrice = container.salesUnitPrice;
                                            if (salesUnitPrice != null && salesUnitPrice > 0) {
                                              const transportFeeVal = watch('transportFee') ?? 0;
                                              const allContainersVal = watch('selectedContainers') || [];
                                              const totalW = allContainersVal.reduce((s, c) => {
                                                const w = c.containerType === 'CARGO' ? (c.cargoWeight ?? 0) : (c.weight ?? 0);
                                                return s + w;
                                              }, 0);
                                              const currW = container.containerType === 'CARGO'
                                                ? (container.cargoWeight ?? 0)
                                                : (container.weight ?? 0);
                                              const wRatio = totalW > 0 && currW > 0 ? currW / totalW : 0;
                                              const transportFeePerKg = currW > 0
                                                ? (transportFeeVal * wRatio) / (currW * 1000)
                                                : 0;
                                              // 마진 = 판매단가 - 원가 - (kg당 운송비)
                                              const newMargin = salesUnitPrice - recalculatedCostNum - transportFeePerKg;
                                              const newSalesPrice = salesUnitPrice * currW * 1000;
                                              updates.margin = newMargin;
                                              updates.salesPrice = newSalesPrice;
                                            }
                                            updateContainer(updates);
                                            
                                            toast({
                                              title: '저장 및 원가 재계산 완료',
                                              description: 'STO, DT, 창고·현장 작업비가 저장되고 원가가 재계산되었습니다.',
                                            });
                                          } catch (error: any) {
                                            console.error('STO, DT, 창고·현장 작업비 저장 및 원가 재계산 실패:', error);
                                            toast({
                                              title: '저장 실패',
                                              description: error?.response?.data?.message || 'STO, DT, 창고·현장 작업비 저장 및 원가 재계산 중 오류가 발생했습니다.',
                                              variant: 'destructive',
                                            });
                                          } finally {
                                            setRecalculatingCosts((prev) => {
                                              const next = new Set(prev);
                                              next.delete(container.id);
                                              return next;
                                            });
                                          }
                                        }}
                                        disabled={recalculatingCosts.has(container.id)}
                                        className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm w-auto max-w-xs"
                                      >
                                        {recalculatingCosts.has(container.id) ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            저장 중...
                                          </>
                                        ) : (
                                          <>
                                            <Calculator className="mr-2 h-4 w-4" />
                                            저장·원가 재계산
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                
                                {/* 판매가 표시 숨김 (계산값만 사용, 저장하지 않음) */}
                                
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 선입금 설정 (판매 전체 기준) - 숨김 처리 */}
                {false && (() => {
                  const selectedContainers = watch('selectedContainers') || [];
                  
                  if (selectedContainers.length === 0) return null;

                  // 전체 판매가 계산 (입고예정/입고확정 모두 포함)
                  let totalSalesPrice = 0;
                  selectedContainers.forEach((container) => {
                    // 재고 상태에 따라 원가 결정
                    const purchaseCost = container.inboundStatus === 'INBOUND_CONFIRMED'
                      ? (container.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : 0)
                      : (container.comparisonPurchaseCost != null ? Number(container.comparisonPurchaseCost) : (container.pendingPurchaseCost ? Number(container.pendingPurchaseCost) : 0));
                    const currentWeight = container.containerType === 'CARGO'
                      ? (container.cargoWeight ?? container.weight ?? 0)
                      : (container.weight ?? 0);
                    const salesUnitPrice = container.salesUnitPrice ?? purchaseCost;
                    const salesPrice = salesUnitPrice > 0 && currentWeight > 0 
                      ? salesUnitPrice * currentWeight * 1000 
                      : 0;
                    totalSalesPrice += salesPrice;
                  });

                  const advancePaymentRatio = watch('advancePaymentRatio') ?? 0;
                  const advancePaymentAmount = watch('advancePaymentAmount');
                  
                  // 선입금 계산: 금액 직접 입력이 있으면 우선, 없으면 비율로 계산
                  const calculatedAdvancePayment = advancePaymentAmount !== null && advancePaymentAmount !== undefined
                    ? advancePaymentAmount
                    : (advancePaymentRatio > 0 ? totalSalesPrice * (advancePaymentRatio / 100) : 0);

                  return (
                    <div className="pt-4 border-t">
                      <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 space-y-4 border border-blue-200 dark:border-blue-900">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                            선입금 설정 (판매 전체 기준)
                          </span>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">전체 판매가</span>
                            <span className="text-sm font-semibold">
                              {totalSalesPrice.toLocaleString('ko-KR', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                              })}원
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="advancePaymentRatio" className="text-xs">
                                선입금 비율 (%)
                              </Label>
                              <NumberInput
                                id="advancePaymentRatio"
                                value={advancePaymentRatio}
                                onChange={(value) => {
                                  setValue('advancePaymentRatio', value ?? 0);
                                  // 금액 직접 입력이 있으면 비율 입력 시 금액 초기화
                                  if (value !== null && value !== undefined) {
                                    setValue('advancePaymentAmount', null);
                                  }
                                }}
                                decimals={2}
                                className="h-8 text-xs"
                                placeholder="예: 50"
                              />
                            </div>
                            
                            <div className="space-y-1">
                              <Label htmlFor="advancePaymentAmount" className="text-xs">
                                선입금 금액 (직접 입력)
                              </Label>
                              <NumberInput
                                id="advancePaymentAmount"
                                value={advancePaymentAmount ?? undefined}
                                onChange={(value) => {
                                  setValue('advancePaymentAmount', value ?? null);
                                  // 금액 직접 입력 시 비율 초기화
                                  if (value !== null && value !== undefined) {
                                    setValue('advancePaymentRatio', null);
                                  }
                                }}
                                decimals={0}
                                className="h-8 text-xs"
                                placeholder="예: 1500000"
                              />
                            </div>
                          </div>

                          {(calculatedAdvancePayment ?? 0) > 0 && (
                            <div className="pt-2 border-t">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                  계산된 선입금
                                </span>
                                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                  {(calculatedAdvancePayment ?? 0).toLocaleString('ko-KR', { 
                                    minimumFractionDigits: 0, 
                                    maximumFractionDigits: 0 
                                  })}원
                                </span>
                              </div>
                              {advancePaymentRatio > 0 && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  (전체 예상 판매가의 {advancePaymentRatio}%)
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 전체 요약 정보 (2개 이상일 때만 표시) */}
                {(() => {
                  const selectedContainers = watch('selectedContainers') || [];
                  const lineCount = useBlProductLine
                    ? selectedBlPackingGroups.length
                    : selectedContainers.length;
                  if (lineCount < 2) return null;

                  // 전체 베일수, 중량, 판매가, 선입금 계산
                  let totalBales = 0;
                  let totalWeight = 0;
                  let totalSalesPrice = 0;
                  let totalAdvancePayment = 0;

                  selectedContainers.forEach((container) => {
                    // 베일수: 카고일 때는 cargoBales, 컨테이너일 때는 bales
                    const bales = container.containerType === 'CARGO'
                      ? (container.cargoBales ?? container.salesBales ?? container.tradeBales ?? 0)
                      : (container.salesBales ?? container.tradeBales ?? 0);
                    totalBales += bales;

                    // 중량: 카고일 때는 cargoWeight, 컨테이너일 때는 weight
                    const weight = container.containerType === 'CARGO'
                      ? (container.cargoWeight ?? container.weight ?? 0)
                      : (container.weight ?? 0);
                    totalWeight += weight;

                    // 판매가
                    const salesPrice = container.salesPrice ?? 0;
                    totalSalesPrice += salesPrice;

                    // 선입금 계산 제거 - 판매 전체 기준으로 변경됨
                  });

                  return (
                    <div className="pt-4 border-t">
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">전체 베일(영업)</span>
                          <span className="text-sm font-semibold">
                            {totalBales.toLocaleString('ko-KR')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">전체 중량</span>
                          <span className="text-sm font-semibold">
                            {Math.round(totalWeight * 1000).toLocaleString('ko-KR')} KG
                          </span>
                        </div>
                        {/* 전체 판매가 표시 숨김 */}
                      </div>
                    </div>
                  );
                })()}
              </section>
            </div>

            <DrawerFooter className="border-t">
              <div className="flex justify-between gap-2">
                <DrawerClose asChild>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                    <X className="mr-1.5 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
                {mode === 'create' ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => {
                        registerModeRef.current = 'RESERVED';
                        handleSubmit(onSubmitInternal)();
                      }}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          예약 등록
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        registerModeRef.current = 'SALE';
                        handleSubmit(onSubmitInternal)();
                      }}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          판매 등록
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {mode === 'confirm' ? '확정 중...' : '저장 중...'}
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {mode === 'edit' ? '수정' : '판매 확정 저장'}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </DrawerFooter>
          </form>
          )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog
        open={customerUpsertConfirmOpen}
        onOpenChange={(next) => {
          if (!next) handleCancelCustomerUpsertConfirm();
        }}
      >
        <AlertDialogContent className="max-h-[90vh] flex flex-col gap-0 sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>저장 전 확인</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {customerUpsertDiffs.length > 0 ? (
                  <p>
                    아래 고객 카드 필드가 함께 갱신됩니다. 대표 주소·연락처 등이 바뀌므로 내용을 다시 한 번 확인해 주세요.
                  </p>
                ) : null}
                {deliverySaveConfirmDiffs.length > 0 ? (
                  <p>
                    선택한 배송지(하차지) 주소록 행만 아래 내용으로 업데이트됩니다. 고객 카드 대표 주소는 이 경우 자동으로 바뀌지 않습니다.
                  </p>
                ) : null}
                {saleUnloadingConfirmDiffs.length > 0 ? (
                  <p>
                    판매(tb_sales)에 저장되는 하차지(우편번호·도로명·지번·상세·법정동)가 아래처럼 바뀝니다.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[min(50vh,400px)] overflow-y-auto rounded-md border my-4 space-y-4">
            {customerUpsertDiffs.length > 0 ? (
              <div>
                <p className="text-sm font-medium px-3 pt-3 pb-1">고객 카드</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[26%] whitespace-nowrap">항목</TableHead>
                      <TableHead>기존</TableHead>
                      <TableHead>변경 후</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerUpsertDiffs.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium align-top text-xs">{row.label}</TableCell>
                        <TableCell className="text-muted-foreground align-top text-xs break-all">
                          {row.before}
                        </TableCell>
                        <TableCell className="align-top text-xs break-all">{row.after}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {deliverySaveConfirmDiffs.length > 0 ? (
              <div>
                <p className="text-sm font-medium px-3 pt-2 pb-1">선택한 배송지(하차지)</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[26%] whitespace-nowrap">항목</TableHead>
                      <TableHead>기존</TableHead>
                      <TableHead>변경 후</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliverySaveConfirmDiffs.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium align-top text-xs">{row.label}</TableCell>
                        <TableCell className="text-muted-foreground align-top text-xs break-all">
                          {row.before}
                        </TableCell>
                        <TableCell className="align-top text-xs break-all">{row.after}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {saleUnloadingConfirmDiffs.length > 0 ? (
              <div>
                <p className="text-sm font-medium px-3 pt-2 pb-1">판매 하차지</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[26%] whitespace-nowrap">항목</TableHead>
                      <TableHead>기존</TableHead>
                      <TableHead>변경 후</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleUnloadingConfirmDiffs.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium align-top text-xs">{row.label}</TableCell>
                        <TableCell className="text-muted-foreground align-top text-xs break-all">
                          {row.before}
                        </TableCell>
                        <TableCell className="align-top text-xs break-all">{row.after}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={customerUpsertConfirmBusy} className="gap-0">
              <X className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              취소
            </AlertDialogCancel>
            <Button
              type="button"
              size="sm"
              disabled={customerUpsertConfirmBusy}
              onClick={() => void handleConfirmCustomerUpsertSubmit()}
            >
              {customerUpsertConfirmBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  저장 중…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                  확인 후 저장
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {watchedCustomerId &&
      (mode === 'create' || mode === 'edit' || mode === 'confirm') ? (
        <CustomerDeliveryAddressFormDialog
          customerId={watchedCustomerId}
          open={addDeliveryAddressDialogOpen}
          onOpenChange={setAddDeliveryAddressDialogOpen}
          existingAddresses={savedDeliveryAddresses}
          editingAddress={null}
          description="현재 선택한 고객에 배송지 주소록으로 저장됩니다. 저장 후 이 판매의 하차지로 바로 적용됩니다."
          onAdded={(addr) => {
            setUnloadingAddressChoice(addr.id);
            setSameAsCustomerAddress(false);
            applyUnloadingFromSavedDeliveryAddress(addr, setValue);
            queueMicrotask(() => {
              deliveryUnloadingBaselineRef.current = {
                deliveryId: addr.id,
                snap: pickUnloadingSnapForDiff(getValues()),
              };
            });
          }}
        />
      ) : null}

      {/* 고객 주소 검색 모달 */}
      {isClient &&
        createPortal(
          <div
            style={{
              pointerEvents: customerAddressModalOpen ? 'auto' : 'none',
              opacity: customerAddressModalOpen ? 1 : 0,
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 11000,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              transition: 'opacity 0.15s ease-in-out',
            }}
            onClick={closeCustomerAddressSearch}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '500px',
                height: '600px',
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">주소 검색</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeCustomerAddressSearch}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div ref={customerAddressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
            </div>
          </div>,
          document.body
        )}

      {/* 하차지 주소 검색 모달 */}
      {isClient &&
        createPortal(
          <div
            style={{
              pointerEvents: unloadingAddressModalOpen ? 'auto' : 'none',
              opacity: unloadingAddressModalOpen ? 1 : 0,
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 11000,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              transition: 'opacity 0.15s ease-in-out',
            }}
            onClick={closeUnloadingAddressSearch}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '500px',
                height: '600px',
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">주소 검색</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeUnloadingAddressSearch}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div ref={unloadingAddressContentRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
            </div>
          </div>,
          document.body
        )}

      {/* 업체명 검색 팝업 */}
      <Dialog open={companySearchOpen} onOpenChange={handleCompanySearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>업체명으로 고객 검색</DialogTitle>
            <DialogDescription>업체명 또는 대표자명을 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCompanySearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={companySearchTerm}
                onChange={(e) => setCompanySearchTerm(e.target.value)}
                placeholder="업체명 또는 대표자명"
                autoFocus
              />
              <Button type="submit" disabled={companySearchLoading}>
                {companySearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>
            {companySearchError && (
              <p className="text-sm text-destructive">{companySearchError}</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {companySearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : companySearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {companySearchAttempted ? '검색 결과가 없습니다.' : '업체명을 입력해 검색하세요.'}
                </div>
              ) : (
                companySearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelectCompany(item)}
                  >
                    <p className="font-medium">{item.companyName || '업체명 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(item.phone ?? '') || '전화번호 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 전화번호 검색 팝업 */}
      <Dialog open={phoneSearchOpen} onOpenChange={handlePhoneSearchOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>전화번호로 고객 검색</DialogTitle>
            <DialogDescription>전화번호를 입력해 기존 고객을 검색할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePhoneSearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={phoneSearchTerm}
                onChange={(e) => setPhoneSearchTerm(e.target.value)}
                placeholder="010-1234-5678"
                autoFocus
              />
              <Button type="submit" disabled={phoneSearchLoading}>
                {phoneSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>
            {phoneSearchError && (
              <p className="text-sm text-destructive">{phoneSearchError}</p>
            )}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {phoneSearchLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  검색 중입니다...
                </div>
              ) : phoneSearchResults.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {phoneSearchAttempted ? '검색 결과가 없습니다.' : '전화번호를 입력해 검색하세요.'}
                </div>
              ) : (
                phoneSearchResults.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                    onClick={() => handleSelectPhone(item)}
                  >
                    <p className="font-medium">{formatPhone(item.phone ?? '') || '전화번호 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.companyName || '업체명 없음'} · {item.ceo || '대표자 정보 없음'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 운송비 검색 팝업: 컨테이너일 때 화물안전운임요금제, 카고일 때 배차 이력 평균 */}
      <Dialog open={transportFeeSearchOpen} onOpenChange={setTransportFeeSearchOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              운송비 검색
              <span className={`text-sm font-normal px-2 py-0.5 rounded-md ${isTransportFeeContainerMode ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                {isTransportFeeContainerMode ? '컨테이너 (화물안전운임요금제)' : '카고 (배차 이력)'}
              </span>
            </DialogTitle>
            <DialogDescription>
              {isTransportFeeContainerMode
                ? '컨테이너 운송: 화물안전운임요금제 기준 요금을 검색해 적용할 수 있습니다. (지역·시군구·동명·항구·거리)'
                : '카고 운송: 지역, 시군구, 차량에 따른 배차 이력 평균 운송비를 확인하고 선택할 수 있습니다.'}
            </DialogDescription>
          </DialogHeader>

          {isTransportFeeContainerMode ? (
            <>
              {/* 화물안전운임요금제 필터 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pb-4 border-b">
                <div className="space-y-2">
                  <Label>항구</Label>
                  <Select value={safeFreightFilterPort} onValueChange={setSafeFreightFilterPort}>
                    <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">전체</SelectItem>
                      {destinationPortCodes.map((p) => (
                        <SelectItem key={p.id ?? p.value} value={String(p.id ?? p.value ?? '')}>{p.name ?? p.value ?? '-'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>지역</Label>
                  <Select
                    value={safeFreightFilterRegion}
                    onValueChange={(v) => { setSafeFreightFilterRegion(v); setSafeFreightFilterCity('__none__'); setSafeFreightFilterTown('__all__'); }}
                  >
                    <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">전체</SelectItem>
                      {safeFreightRegionNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>시군구</Label>
                  <Select
                    value={safeFreightFilterCity}
                    onValueChange={(v) => { setSafeFreightFilterCity(v); setSafeFreightFilterTown('__all__'); }}
                    disabled={safeFreightFilterRegion === '__none__'}
                  >
                    <SelectTrigger><SelectValue placeholder={safeFreightFilterRegion === '__none__' ? '지역 선택 후' : '전체'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">전체</SelectItem>
                      {safeFreightCityNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>동명</Label>
                  <Select
                    value={safeFreightFilterTown}
                    onValueChange={setSafeFreightFilterTown}
                    disabled={safeFreightFilterRegion === '__none__' || safeFreightFilterCity === '__none__'}
                  >
                    <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">전체</SelectItem>
                      {safeFreightTownNames.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>거리(km)</Label>
                  <Select value={safeFreightFilterDistance} onValueChange={setSafeFreightFilterDistance}>
                    <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">전체</SelectItem>
                      {safeFreightDistanceList.map((d) => <SelectItem key={d} value={String(d)}>{d} km</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pb-3 border-b">
                <Label className="sr-only">할증</Label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={safeFreightSurchargeHoliday} onCheckedChange={(c) => setSafeFreightSurchargeHoliday(!!c)} />
                  <span className="text-sm">공휴일 할증 (20%)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={safeFreightSurchargeLateNight} onCheckedChange={(c) => setSafeFreightSurchargeLateNight(!!c)} />
                  <span className="text-sm">심야 할증 (20%)</span>
                </label>
                <span className="text-xs text-muted-foreground">중복 시 30% 적용</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
                {safeFreightRatesLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                ) : safeFreightRates.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">조건에 맞는 화물안전운임 요금이 없습니다.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">항구</TableHead>
                        <TableHead className="w-[100px]">지역</TableHead>
                        <TableHead className="w-[100px]">시군구</TableHead>
                        <TableHead className="w-[80px]">동명</TableHead>
                        <TableHead className="w-[70px] text-right">거리</TableHead>
                        <TableHead className="w-[110px] text-right">기본운임</TableHead>
                        <TableHead className="w-[110px] text-right">적용운임</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {safeFreightRates.map((rate) => {
                        const applied = applySafeFreightSurcharge(rate.safeTransportRate);
                        return (
                          <TableRow
                            key={rate.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSelectTransportFee(applied)}
                          >
                            <TableCell>{rate.portCode?.name ?? rate.portCode?.value ?? '-'}</TableCell>
                            <TableCell className="font-medium">{rate.regionName ?? '-'}</TableCell>
                            <TableCell>{rate.cityName ?? '-'}</TableCell>
                            <TableCell>{rate.townName ?? '-'}</TableCell>
                            <TableCell className="text-right">{rate.distanceKm != null ? `${rate.distanceKm} km` : '-'}</TableCell>
                            <TableCell className="text-right">{Math.round(rate.safeTransportRate).toLocaleString('ko-KR')}원</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{Math.round(applied).toLocaleString('ko-KR')}원</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          ) : (
            <>
              {/* 카고: 배차 이력 기반 필터 */}
              <div className="grid grid-cols-3 gap-4 pb-4 border-b">
                <div className="space-y-2">
                  <Label htmlFor="transportFeeFilterRegion">지역</Label>
                  <Select
                    value={transportFeeFilterRegion}
                    onValueChange={(value) => {
                      setTransportFeeFilterRegion(value);
                      setTransportFeeFilterCity('__none__');
                    }}
                  >
                    <SelectTrigger id="transportFeeFilterRegion">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">전체</SelectItem>
                      {regions?.map((region) => (
                        <SelectItem key={region.id} value={region.name}>
                          {region.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transportFeeFilterCity">시군구</Label>
                  <Select
                    value={transportFeeFilterCity}
                    onValueChange={setTransportFeeFilterCity}
                    disabled={transportFeeFilterRegion === '__none__'}
                  >
                    <SelectTrigger id="transportFeeFilterCity">
                      <SelectValue placeholder={transportFeeFilterRegion === '__none__' ? '지역 선택 후' : '전체'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">전체</SelectItem>
                      {transportFeeFilterCities?.map((city) => (
                        <SelectItem key={city.id} value={city.name}>
                          {city.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transportFeeFilterVehicle">차량</Label>
                  <Select
                    value={transportFeeFilterVehicle}
                    onValueChange={setTransportFeeFilterVehicle}
                  >
                    <SelectTrigger id="transportFeeFilterVehicle">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">전체</SelectItem>
                      {requestVehicleCodes?.map((code) => (
                        <SelectItem key={code.value || code.name} value={code.value || code.name || ''}>
                          {code.name || code.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
                {filteredTransportFeeStats.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    조건에 맞는 운송비 데이터가 없습니다.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">지역</TableHead>
                        <TableHead className="w-[150px]">시군구</TableHead>
                        <TableHead className="w-[150px]">차량</TableHead>
                        <TableHead className="w-[120px] text-right">평균 가격</TableHead>
                        <TableHead className="w-[100px] text-right">건수</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransportFeeStats.map((stat, index) => {
                        const formattedPrice = stat.transportFeeAvg > 0 && isFinite(stat.transportFeeAvg)
                          ? `${Math.round(stat.transportFeeAvg).toLocaleString('ko-KR')}원`
                          : '-';
                        return (
                          <TableRow
                            key={index}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSelectTransportFee(Math.round(stat.transportFeeAvg))}
                          >
                            <TableCell className="font-medium">{stat.region}</TableCell>
                            <TableCell>{stat.city || '-'}</TableCell>
                            <TableCell>{stat.requestVehicleName}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{formattedPrice}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{stat.vehicleCount}건</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 상품 선택: 모바일에서만 별도 overlay drawer 사용 (데스크톱은 drawer 내부에 패널로 포함됨) */}
      {isMobile && (
        <Drawer open={productSelectDrawerOpen} onOpenChange={(open) => {
          if (!open) handleProductSelectDrawerClose();
        }} direction="right" dismissible={false}>
          <DrawerContent
            className="h-full"
            style={{ width: '100%', maxWidth: '95vw', userSelect: 'text', WebkitUserSelect: 'text' }}
          >
            {renderProductSelectContent()}
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}

