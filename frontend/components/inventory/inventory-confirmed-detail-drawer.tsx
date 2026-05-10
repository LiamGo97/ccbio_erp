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
import { Loader2, X, Plus, Minus, Edit, Trash2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SalesFormDrawer } from '@/components/sales/sales-form-drawer';
import { SalesDetailDrawer } from '@/components/sales/sales-detail-drawer';
import { useCreateSales, CreateSalesDto } from '@/lib/hooks/use-sales';

interface InventoryConfirmedDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerId?: string | null;
  onInventoryAdjustmentSuccess?: () => void; // 재고 조정 성공 시 콜백
}

interface ContainerDetail {
  id: string;
  containerNo: string;
  salesBales: number | null;
  tradeBales: number | null;
  weight: number | null;
  appliedExchangeRate: number | null;
  finalWeightedExchangeRate: number | null;
  dayExchangeRate: number | null;
  product: string | null;
  productName: string | null;
  tradeGrade: string | null;
  tradeGradeName: string | null;
  salesGrade: string | null;
  salesGradeName: string | null;
  packingType: string | null;
  packingTypeName: string | null;
  pendingPurchaseCost: number | null;
  confirmedPurchaseCost: number | null;
  finalPurchaseCost: number | null;
  stoCost: number | string | null;
  dtCost: number | string | null;
  workFee: number | string | null;
  onsiteWorkFee?: number | string | null;
  inventoryStatus: string | null;
  orderId: string | null;
  contractNo: string | null;
  sequence: number | null;
  bk: string | null;
  bl: string | null;
  etaDate: string | null;
  exportCountry: string | null;
  exportCountryName: string | null;
  exporter: string | null;
  exporterName: string | null;
  shippingLine: string | null;
  shippingLineName: string | null;
  destination: string | null;
  destinationName: string | null;
  inboundWarehouse: string | null;
  inboundWarehouseName: string | null;
  inboundIgodate: string | null;
  inboundQuarantineDate: string | null;
  inboundDtDate: string | null;
  returnStatus: string | null;
  returnStatusName: string | null;
  notes: string | null;
  /** BL(주문) 영업 비고 - 컨테이너 비고 없을 때 fallback */
  orderSalesNotes?: string | null;
}

interface SalesHistoryItem {
  id: string;
  salesId: string | null;
  salesNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  status: string | null;
  statusName: string | null;
  containerType: string | null;
  cargoBales: number;
  cargoWeight: number;
  salesUnitPriceStage: string | null;
  salesUnitPrice: number | null;
  margin: number | null;
  stoCost: number | null;
  dtCost: number | null;
  workFee: number | null;
  onsiteWorkFee?: number | null;
  reservationDate: string | null;
  salesDate: string | null;
  createdAt: string | null;
  registeredBy: number | null;
  registeredByName: string | null;
  /** 판매/재고조정 항목 비고 (si_reservation_notes) */
  notes?: string | null;
}

interface ContainerDetailResponse {
  container: ContainerDetail;
  salesHistory: SalesHistoryItem[];
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

const formatNumber = (value?: number | null, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

export function InventoryConfirmedDetailDrawer({
  open,
  onOpenChange,
  containerId,
  onInventoryAdjustmentSuccess,
}: InventoryConfirmedDetailDrawerProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = React.useState(false);
  const [adjustmentType, setAdjustmentType] = React.useState<'INBOUND' | 'CONSUMPTION' | null>(null);
  /** 재고 소모 시 입력 모드: EXCLUDE=제외할 수량, REMAINING=남아있어야 할 수량 */
  const [consumptionInputMode, setConsumptionInputMode] = React.useState<'EXCLUDE' | 'REMAINING'>('EXCLUDE');
  const [adjustmentForm, setAdjustmentForm] = React.useState({
    bales: '',
    weight: '',
    notes: '',
  });
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [selectedSalesItem, setSelectedSalesItem] = React.useState<SalesHistoryItem | null>(null);
  const [editForm, setEditForm] = React.useState({
    bales: '',
    weight: '',
    notes: '',
  });
  /** 판매 수정: SalesFormDrawer 열기용 (고객 있는 판매 이력 행에서 수정 클릭 시) */
  const [salesDrawerOpen, setSalesDrawerOpen] = React.useState(false);
  const [editingSalesId, setEditingSalesId] = React.useState<string | null>(null);
  /** 판매 등록: SalesFormDrawer create 모드 (현재 컨테이너 미리 선택) */
  const [salesCreateDrawerOpen, setSalesCreateDrawerOpen] = React.useState(false);
  const createSalesMutation = useCreateSales();

  const { data, isLoading, refetch } = useQuery<ContainerDetailResponse>({
    queryKey: ['container-detail', containerId],
    queryFn: async () => {
      if (!containerId) throw new Error('컨테이너 ID가 필요합니다.');
      console.log('[입고 확정 재고 상세] API 호출 시작 - 컨테이너 ID:', containerId);
      const response = await api.get(`/trade/contracts/containers/${containerId}`);
      console.log('[입고 확정 재고 상세] API 응답:', {
        containerId,
        salesHistoryCount: response.data?.salesHistory?.length ?? 0,
        salesHistory: response.data?.salesHistory ?? [],
        container: response.data?.container,
      });
      return response.data;
    },
    enabled: !!containerId && open,
  });

  // 데이터 변경 시 로그
  React.useEffect(() => {
    if (data) {
      console.log('[입고 확정 재고 상세] 데이터 로드 완료:', {
        containerId: data.container?.id,
        containerNo: data.container?.containerNo,
        salesHistoryCount: data.salesHistory?.length ?? 0,
        salesHistory: data.salesHistory,
      });
    }
  }, [data]);

  // 가용 베일·중량 계산 (원본 - 판매이력 합계, 입고는 음수·소모/판매는 양수)
  const { availableBales, availableWeightKg } = React.useMemo(() => {
    if (!data?.container || !data?.salesHistory) {
      return { availableBales: null, availableWeightKg: null };
    }
    const baseBales = data.container.salesBales ?? data.container.tradeBales ?? 0;
    const baseWeightTons = data.container.weight ?? 0;
    const sumBales = data.salesHistory.reduce((s, h) => s + (h.cargoBales ?? 0), 0);
    const sumWeightTons = data.salesHistory.reduce((s, h) => s + ((h.cargoWeight ?? 0)), 0);
    return {
      availableBales: baseBales - sumBales,
      availableWeightKg: (baseWeightTons - sumWeightTons) * 1000, // 톤 → kg
    };
  }, [data?.container, data?.salesHistory]);

  const adjustInventoryMutation = useMutation({
    mutationFn: async (formData: { type: 'INBOUND' | 'CONSUMPTION'; bales?: number | null; weight?: number | null; notes?: string | null }) => {
      if (!containerId) throw new Error('컨테이너 ID가 필요합니다.');
      const response = await api.post(`/trade/contracts/containers/${containerId}/adjust-inventory`, formData);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: '성공',
        description: adjustmentType === 'INBOUND' ? '재고 입고가 완료되었습니다.' : '재고 소모가 완료되었습니다.',
      });
      setAdjustmentDialogOpen(false);
      setAdjustmentType(null);
      setAdjustmentForm({
        bales: '',
        weight: '',
        notes: '',
      });
      refetch(); // 상세 정보 갱신
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      // 목록 페이지 갱신 콜백 호출
      if (onInventoryAdjustmentSuccess) {
        onInventoryAdjustmentSuccess();
      }
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.response?.data?.message || '재고 조정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleAdjustmentSubmit = () => {
    if (!adjustmentType) return;
    
    // 빈 문자열이나 유효하지 않은 값은 null로 처리
    const balesValue = adjustmentForm.bales?.trim();
    const weightValue = adjustmentForm.weight?.trim();
    
    let bales = balesValue ? (isNaN(parseFloat(balesValue)) ? null : parseFloat(balesValue)) : null;
    let weightKg = weightValue ? (isNaN(parseFloat(weightValue)) ? null : parseFloat(weightValue)) : null;
    
    // bales와 weight가 모두 없으면 오류
    if (bales === null && weightKg === null) {
      toast({
        title: '오류',
        description: '베일 또는 중량을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }
    
    // 재고 소모 + "남아있어야 할 수량" 모드: 입력값을 제외할 수량으로 변환
    if (adjustmentType === 'CONSUMPTION' && consumptionInputMode === 'REMAINING') {
      if (availableBales == null && availableWeightKg == null) {
        toast({
          title: '오류',
          description: '가용 수량을 계산할 수 없습니다.',
          variant: 'destructive',
        });
        return;
      }
      // 제외할 베일 = 가용 베일 - 남아있어야 할 베일
      if (bales !== null && availableBales != null) {
        if (bales > availableBales) {
          toast({
            title: '오류',
            description: `남아있어야 할 베일(${bales})이 가용 베일(${formatNumber(availableBales, 4)})보다 클 수 없습니다.`,
            variant: 'destructive',
          });
          return;
        }
        bales = availableBales - bales;
      } else {
        bales = null;
      }
      // 제외할 중량(kg) = 가용 중량(kg) - 남아있어야 할 중량(kg)
      if (weightKg !== null && availableWeightKg != null) {
        if (weightKg > availableWeightKg) {
          toast({
            title: '오류',
            description: `남아있어야 할 중량(${formatNumber(weightKg, 0)} kg)이 가용 중량(${formatNumber(availableWeightKg, 0)} kg)보다 클 수 없습니다.`,
            variant: 'destructive',
          });
          return;
        }
        weightKg = availableWeightKg - weightKg;
      } else {
        weightKg = null;
      }
      // 변환 후 둘 다 0 이하면 오류
      if ((bales == null || bales <= 0) && (weightKg == null || weightKg <= 0)) {
        toast({
          title: '오류',
          description: '제외할 수량이 0보다 커야 합니다. 남아있어야 할 수량이 가용 수량보다 작아야 합니다.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    const formData = {
      type: adjustmentType,
      bales: bales !== null && bales >= 0 ? bales : null,
      weight: weightKg !== null && weightKg >= 0 ? weightKg / 1000 : null, // 사용자 입력(kg) → 톤으로 전송
      notes: adjustmentForm.notes?.trim() || null,
    };

    adjustInventoryMutation.mutate(formData);
  };

  const updateSalesItemMutation = useMutation({
    mutationFn: async (formData: { cargoBales?: number | null; cargoWeight?: number | null; notes?: string | null }) => {
      if (!selectedSalesItem) throw new Error('판매 항목이 선택되지 않았습니다.');
      const response = await api.put(`/sales/items/${selectedSalesItem.id}`, formData);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: '성공',
        description: '판매 항목이 수정되었습니다.',
      });
      setEditDialogOpen(false);
      setSelectedSalesItem(null);
      setEditForm({
        bales: '',
        weight: '',
        notes: '',
      });
      refetch(); // 상세 정보 갱신
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      // 목록 페이지 갱신 콜백 호출
      if (onInventoryAdjustmentSuccess) {
        onInventoryAdjustmentSuccess();
      }
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.response?.data?.message || '판매 항목 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const deleteSalesItemMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSalesItem) throw new Error('판매 항목이 선택되지 않았습니다.');
      const response = await api.delete(`/sales/items/${selectedSalesItem.id}`);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: '성공',
        description: '판매 항목이 삭제되었습니다.',
      });
      setDeleteDialogOpen(false);
      setSelectedSalesItem(null);
      refetch(); // 상세 정보 갱신
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      // 목록 페이지 갱신 콜백 호출
      if (onInventoryAdjustmentSuccess) {
        onInventoryAdjustmentSuccess();
      }
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.response?.data?.message || '판매 항목 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const updateContainerReturnStatusMutation = useMutation({
    mutationFn: async (returnStatus: string) => {
      if (!containerId) throw new Error('컨테이너 ID가 필요합니다.');
      const response = await api.patch(`/trade/contracts/containers/${containerId}`, { returnStatus });
      return response.data;
    },
    onSuccess: () => {
      toast({ title: '저장됨', description: '반납여부가 변경되었습니다.' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      if (onInventoryAdjustmentSuccess) onInventoryAdjustmentSuccess();
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.response?.data?.message || '반납여부 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const [containerNotesEdit, setContainerNotesEdit] = React.useState<string>('');
  const [returnStatusEdit, setReturnStatusEdit] = React.useState<string>('NOT_RETURNED');
  React.useEffect(() => {
    if (data?.container) {
      setReturnStatusEdit(data.container.returnStatus ?? 'NOT_RETURNED');
    }
  }, [data?.container?.id, data?.container?.returnStatus]);
  React.useEffect(() => {
    if (data?.container) {
      // 컨테이너 비고 없으면 BL 영업 비고를 기본값으로 (계약-주문 패턴)
      setContainerNotesEdit(data.container.notes ?? data.container.orderSalesNotes ?? '');
    }
  }, [data?.container?.id, data?.container?.notes, data?.container?.orderSalesNotes]);
  const updateContainerNotesMutation = useMutation({
    mutationFn: async (notes: string | null) => {
      if (!containerId) throw new Error('컨테이너 ID가 필요합니다.');
      const response = await api.patch(`/trade/contracts/containers/${containerId}`, { notes: notes?.trim() || null });
      return response.data;
    },
    onSuccess: (_, notes) => {
      setContainerNotesEdit(notes ?? '');
      toast({ title: '저장됨', description: '컨테이너 비고가 저장되었습니다.' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      if (onInventoryAdjustmentSuccess) onInventoryAdjustmentSuccess();
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.response?.data?.message || '컨테이너 비고 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const RETURN_STATUS_OPTIONS = [
    { value: 'NOT_RETURNED', label: '미반납' },
    { value: 'RETURNED', label: '반납' },
    { value: 'LEASED', label: '임대컨' },
    { value: 'LEASED_ENDED', label: '임대컨 종료' },
  ] as const;

  const { data: salesItemStatusCodes = [] } = useCodeMastersByGroup('SALES_ITEM_STATUS');
  const { data: warehouses = [] } = useWarehouses({ status: true });

  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    salesItemStatusCodes.forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [salesItemStatusCodes]);

  const getStatusBadgeStyle = (status?: string | null) => {
    if (!status) return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
    
    const normalizedStatus = status.trim().toUpperCase();
    if (normalizedStatus === 'SALES_ITEM_RESERVED') {
      return 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300';
    }
    if (normalizedStatus === 'SALES_ITEM_SOLD') {
      return 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300';
    }
    if (normalizedStatus === 'SALES_ITEM_COMPLETED') {
      return 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300';
    }
    if (normalizedStatus === 'SALES_ITEM_CANCELLED') {
      return 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300';
    }
    if (normalizedStatus === 'INVENTORY_INBOUND' || normalizedStatus === 'INVENTORY_CONSUMPTION') {
      return 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300';
    }
    return 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300';
  };

  const getInventoryStatusBadgeStyle = (status?: string | null) => {
    if (!status) {
      return {
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
        label: '-',
      };
    }
    
    const statusStyles: Record<string, { className: string; label: string }> = {
      AVAILABLE: {
        className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
        label: '가용',
      },
      RESERVED: {
        className: 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300',
        label: '예약됨',
      },
      PARTIALLY_RESERVED: {
        className: 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300',
        label: '부분 예약',
      },
      PARTIALLY_SOLD: {
        className: 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300',
        label: '부분 판매중',
      },
      PARTIALLY_SOLD_COMPLETED: {
        className: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
        label: '부분 판매완료',
      },
      SELLING: {
        className: 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200',
        label: '판매중',
      },
      SOLD_OUT: {
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
        label: '판매 완료',
      },
    };
    
    const style = statusStyles[status];
    if (!style) {
      return { className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300', label: status };
    }
    return style;
  };

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && containerId) {
      refetch();
    }
  }, [open, containerId, refetch]);

  // 텍스트 선택을 위한 핸들러
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
      if (salesDrawerOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSalesDrawerOpen(false);
        setEditingSalesId(null);
        void refetch();
        return;
      }
      if (salesCreateDrawerOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSalesCreateDrawerOpen(false);
        return;
      }
      if (deleteDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setDeleteDialogOpen(false);
        setSelectedSalesItem(null);
        return;
      }
      if (editDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setEditDialogOpen(false);
        setSelectedSalesItem(null);
        setEditForm({ bales: '', weight: '', notes: '' });
        return;
      }
      if (adjustmentDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setAdjustmentDialogOpen(false);
        setAdjustmentType(null);
        setConsumptionInputMode('EXCLUDE');
        setAdjustmentForm({ bales: '', weight: '', notes: '' });
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    open,
    salesDrawerOpen,
    salesCreateDrawerOpen,
    deleteDialogOpen,
    editDialogOpen,
    adjustmentDialogOpen,
    onOpenChange,
    refetch,
  ]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{ 
          width: isMobile ? '100%' : '85%', 
          maxWidth: '1200px',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>입고 확정 재고 상세정보</DrawerTitle>
              <DrawerDescription>
                컨테이너 정보와 판매 이력을 확인할 수 있습니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              데이터를 불러올 수 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              {/* 컨테이너 정보 */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">컨테이너 정보</h3>
                  {data.container.inventoryStatus ? (
                    <Badge variant="outline" className={getInventoryStatusBadgeStyle(data.container.inventoryStatus).className}>
                      {getInventoryStatusBadgeStyle(data.container.inventoryStatus).label}
                    </Badge>
                  ) : null}
                </div>
                <div className="grid grid-cols-6 gap-x-4 gap-y-1 min-w-0">
                  <InfoRow label="컨테이너 번호" value={data.container.containerNo} />
                  <InfoRow label="상품" value={data.container.productName} />
                  <InfoRow label="등급(무역)" value={data.container.tradeGradeName} />
                  <InfoRow label="등급(영업)" value={data.container.salesGradeName} />
                  <InfoRow label="패킹 타입" value={data.container.packingTypeName} />
                  <InfoRow label="베일(영업)" value={(data.container.salesBales ?? data.container.tradeBales) != null ? formatNumber(Number(data.container.salesBales ?? data.container.tradeBales), 4) : '-'} />
                </div>
                <div className="grid grid-cols-6 gap-x-4 gap-y-1 min-w-0">
                  <InfoRow label="중량" value={data.container.weight != null ? formatNumber(Number(data.container.weight) * 1000, 0) + ' kg' : '-'} />
                  <InfoRow label="가중 평균 환율" value={data.container.finalWeightedExchangeRate != null ? formatNumber(data.container.finalWeightedExchangeRate, 2) : '-'} />
                  <InfoRow label="예정원가" value={data.container.pendingPurchaseCost != null ? formatNumber(data.container.pendingPurchaseCost, 2) : '-'} />
                  <InfoRow label="확정원가" value={data.container.confirmedPurchaseCost != null ? formatNumber(data.container.confirmedPurchaseCost, 2) : '-'} />
                  <InfoRow label="최종원가" value={data.container.finalPurchaseCost != null ? formatNumber(data.container.finalPurchaseCost, 2) : '-'} />
                </div>
                <div className="grid grid-cols-6 gap-x-4 gap-y-1 min-w-0">
                  <InfoRow label="계약번호" value={data.container.contractNo} />
                  <InfoRow label="B/K" value={data.container.bk} />
                  <InfoRow label="B/L" value={data.container.bl} />
                  <InfoRow label="수출국" value={data.container.exportCountryName} />
                  <InfoRow label="수출사" value={data.container.exporterName} />
                  <InfoRow label="선사" value={data.container.shippingLineName} />
                </div>
                <div className="grid grid-cols-6 gap-x-4 gap-y-1 min-w-0">
                  <InfoRow label="목적지" value={data.container.destinationName} />
                  <InfoRow label="ETA" value={formatDate(data.container.etaDate)} />
                  <InfoRow
                    label="창고"
                    value={
                      data.container.inboundWarehouseName ??
                      (data.container.inboundWarehouse
                        ? warehouses.find(
                            (w) =>
                              w.name === data.container.inboundWarehouse ||
                              w.id.toString() === data.container.inboundWarehouse
                          )?.name ?? data.container.inboundWarehouse
                        : null)
                    }
                  />
                  <InfoRow label="이고날짜" value={formatDate(data.container.inboundIgodate)} />
                  <InfoRow label="검역날짜" value={formatDate(data.container.inboundQuarantineDate)} />
                  <InfoRow label="DT날짜" value={formatDate(data.container.inboundDtDate)} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 min-w-0">
                  <InfoRow label="STO" value={data.container.stoCost != null && data.container.stoCost !== '' ? formatNumber(Number(data.container.stoCost), 2) : '-'} />
                  <InfoRow label="DT" value={data.container.dtCost != null && data.container.dtCost !== '' ? formatNumber(Number(data.container.dtCost), 2) : '-'} />
                  <InfoRow label="창고 작업비" value={data.container.workFee != null && data.container.workFee !== '' ? formatNumber(Number(data.container.workFee), 2) : '-'} />
                  <InfoRow
                    label="현장 작업비"
                    value={
                      data.container.onsiteWorkFee != null && data.container.onsiteWorkFee !== ''
                        ? formatNumber(Number(data.container.onsiteWorkFee), 2)
                        : '-'
                    }
                  />
                </div>
                <div className="mt-4 flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">반납여부</span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={returnStatusEdit}
                      onValueChange={(value) => setReturnStatusEdit(value ?? 'NOT_RETURNED')}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RETURN_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => updateContainerReturnStatusMutation.mutate(returnStatusEdit)}
                      disabled={
                        updateContainerReturnStatusMutation.isPending ||
                        returnStatusEdit === (data.container.returnStatus ?? 'NOT_RETURNED')
                      }
                    >
                      {updateContainerReturnStatusMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        '저장'
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">변경 후 저장 버튼을 눌러주세요.</p>
                </div>
              </section>

              {/* 컨테이너 비고 - 판매 이력 바로 위 */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">비고</h3>
                <div className="flex gap-2">
                  <Textarea
                    value={containerNotesEdit}
                    onChange={(e) => setContainerNotesEdit(e.target.value)}
                    placeholder="컨테이너 비고를 입력하세요"
                    rows={2}
                    className="resize-none flex-1"
                    disabled={updateContainerNotesMutation.isPending}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      updateContainerNotesMutation.mutate(containerNotesEdit.trim() || null);
                    }}
                    disabled={updateContainerNotesMutation.isPending}
                  >
                    {updateContainerNotesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '저장'}
                  </Button>
                </div>
              </section>

              {/* 판매 이력 */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">판매 이력</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => setSalesCreateDrawerOpen(true)}
                    >
                      판매 등록
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAdjustmentType(null);
                        setAdjustmentDialogOpen(true);
                      }}
                    >
                      재고 조정
                    </Button>
                  </div>
                </div>
                {data.salesHistory && data.salesHistory.length > 0 ? (
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="w-[80px]">번호</TableHead>
                          <TableHead className="w-[150px]">고객명</TableHead>
                          <TableHead className="w-[100px]">상태</TableHead>
                          <TableHead className="w-[80px]">타입</TableHead>
                          <TableHead className="w-[100px] text-right">베일</TableHead>
                          <TableHead className="w-[100px] text-right">중량</TableHead>
                          <TableHead className="w-[90px]">구분</TableHead>
                          <TableHead className="w-[120px] text-right">판매단가</TableHead>
                          <TableHead className="w-[100px] text-right">마진</TableHead>
                          <TableHead className="w-[100px]">예약일</TableHead>
                          <TableHead className="w-[100px]">판매일</TableHead>
                          <TableHead className="w-[100px]">등록자</TableHead>
                          <TableHead className="min-w-[140px] max-w-[220px]">비고</TableHead>
                          <TableHead className="w-[100px]">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.salesHistory.map((item, index) => {
                          // 재고 조정으로 생성된 항목인지 확인 (고객이 없는 경우)
                          const isAdjustmentItem = !item.customerId;
                          
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{index + 1}</TableCell>
                              <TableCell>{item.customerName || '-'}</TableCell>
                              <TableCell>
                                {item.status ? (
                                  <Badge variant="outline" className={getStatusBadgeStyle(item.status)}>
                                    {item.statusName || item.status}
                                  </Badge>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                {item.containerType === 'CONTAINER' ? '컨테이너' : item.containerType === 'CARGO' ? '카고' : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.cargoBales !== 0
                                  ? (item.cargoBales < 0 ? '-' : '') + formatNumber(Math.abs(item.cargoBales), 4)
                                  : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.cargoWeight !== 0
                                  ? (item.cargoWeight < 0 ? '-' : '') + formatNumber(Math.abs(item.cargoWeight) * 1000, 0) + ' kg'
                                  : '-'}
                              </TableCell>
                              <TableCell>
                                {item.salesUnitPriceStage ? (
                                  <Badge
                                    variant="outline"
                                    className={
                                      item.salesUnitPriceStage === 'LOADING'
                                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                        : item.salesUnitPriceStage === 'ARRIVAL'
                                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                          : item.salesUnitPriceStage === 'UNLOADING'
                                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                            : ''
                                    }
                                  >
                                    {item.salesUnitPriceStage === 'LOADING'
                                      ? '상차'
                                      : item.salesUnitPriceStage === 'ARRIVAL'
                                        ? '도착'
                                        : item.salesUnitPriceStage === 'UNLOADING'
                                          ? '도착하역'
                                          : item.salesUnitPriceStage}
                                  </Badge>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.salesUnitPrice != null ? formatNumber(item.salesUnitPrice, 2) : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.margin != null ? formatNumber(item.margin, 2) : '-'}
                              </TableCell>
                              <TableCell>{formatDate(item.reservationDate)}</TableCell>
                              <TableCell>{formatDate(item.salesDate)}</TableCell>
                              <TableCell>{item.registeredByName || '-'}</TableCell>
                              <TableCell
                                className="max-w-[220px] align-top text-sm text-muted-foreground"
                                title={item.notes?.trim() ? item.notes : undefined}
                              >
                                {item.notes?.trim() ? (
                                  <span className="line-clamp-2 whitespace-pre-wrap break-words">
                                    {item.notes}
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                              <TableCell>
                                {isAdjustmentItem ? (
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      onClick={() => {
                                        setSelectedSalesItem(item);
                                        setEditForm({
                                          bales: item.cargoBales !== 0 ? Math.abs(item.cargoBales).toString() : '',
                                          weight: item.cargoWeight !== 0 ? (Math.abs(item.cargoWeight) * 1000).toString() : '', // 톤 → kg 표시
                                          notes: item.notes ?? '',
                                        });
                                        setEditDialogOpen(true);
                                      }}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        setSelectedSalesItem(item);
                                        setDeleteDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : item.salesId ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7"
                                    onClick={() => {
                                      setEditingSalesId(item.salesId);
                                      setSalesDrawerOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4 mr-1" />
                                    수정
                                  </Button>
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-muted/30 font-medium border-t-2">
                          <TableCell colSpan={4} className="text-right font-medium">
                            합계
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(
                              data.salesHistory.reduce((sum, item) => sum + (item.cargoBales ?? 0), 0),
                              4,
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {(() => {
                              // 재고 입고(음수)는 차감, 재고 소모·판매(양수)는 가산
                              const totalKg = data.salesHistory.reduce(
                                (sum, item) => sum + ((item.cargoWeight ?? 0) * 1000),
                                0,
                              );
                              return totalKg !== 0 ? formatNumber(totalKg, 0) + ' kg' : '-';
                            })()}
                          </TableCell>
                          <TableCell colSpan={8} />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-8 text-center border border-border rounded-md">
                    판매 이력이 없습니다.
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        <DrawerFooter className="border-t border-border">
          <div className="flex justify-between gap-2">
            <DrawerClose asChild>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>

      {/* 재고 조정 다이얼로그 */}
      <Dialog open={adjustmentDialogOpen} onOpenChange={(open) => {
        setAdjustmentDialogOpen(open);
        if (!open) {
          setAdjustmentType(null);
          setConsumptionInputMode('EXCLUDE');
          setAdjustmentForm({
            bales: '',
            weight: '',
            notes: '',
          });
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>재고 조정</DialogTitle>
            <DialogDescription>
              재고 입고 또는 소모를 선택하여 재고를 조정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="adjustmentType">조정 유형</Label>
              <Select
                value={adjustmentType || ''}
                onValueChange={(value) => {
                  setAdjustmentType(value as 'INBOUND' | 'CONSUMPTION');
                }}
              >
                <SelectTrigger id="adjustmentType">
                  <SelectValue placeholder="조정 유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOUND">재고 입고</SelectItem>
                  <SelectItem value="CONSUMPTION">재고 소모</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {adjustmentType && (
              <>
                {adjustmentType === 'CONSUMPTION' && (
                  <div className="space-y-2">
                    <Label>입력 방식</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="consumptionMode"
                          checked={consumptionInputMode === 'EXCLUDE'}
                          onChange={() => setConsumptionInputMode('EXCLUDE')}
                          className="rounded border-input"
                        />
                        <span className="text-sm">제외할 베일·중량</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="consumptionMode"
                          checked={consumptionInputMode === 'REMAINING'}
                          onChange={() => setConsumptionInputMode('REMAINING')}
                          className="rounded border-input"
                        />
                        <span className="text-sm">남아있어야 할 베일·중량</span>
                      </label>
                    </div>
                    {consumptionInputMode === 'REMAINING' && (
                      <p className="text-xs text-muted-foreground">
                        가용: 베일{' '}
                        <span className={availableBales != null && availableBales < 0 ? 'text-red-600 dark:text-red-400 font-medium' : undefined}>
                          {availableBales != null ? formatNumber(availableBales, 4) : '-'}
                        </span>
                        {' / '}
                        중량{' '}
                        <span className={availableWeightKg != null && availableWeightKg < 0 ? 'text-red-600 dark:text-red-400 font-medium' : undefined}>
                          {availableWeightKg != null ? formatNumber(availableWeightKg, 0) + ' kg' : '-'}
                        </span>
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="bales">
                    {adjustmentType === 'CONSUMPTION' && consumptionInputMode === 'REMAINING' ? '남아있어야 할 베일' : '베일'}
                  </Label>
                  <Input
                    id="bales"
                    type="number"
                    step="0.01"
                    placeholder={adjustmentType === 'CONSUMPTION' && consumptionInputMode === 'REMAINING' ? '남아있어야 할 베일 수량' : '베일 수량'}
                    value={adjustmentForm.bales}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, bales: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">
                    {adjustmentType === 'CONSUMPTION' && consumptionInputMode === 'REMAINING' ? '남아있어야 할 중량 (kg)' : '중량 (kg)'}
                  </Label>
                  <Input
                    id="weight"
                    type="number"
                    step="1"
                    placeholder={adjustmentType === 'CONSUMPTION' && consumptionInputMode === 'REMAINING' ? '남아있어야 할 중량 (kg)' : '중량 (kg)'}
                    value={adjustmentForm.weight}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, weight: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">비고 (선택)</Label>
                  <Textarea
                    id="notes"
                    placeholder="비고"
                    value={adjustmentForm.notes}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAdjustmentDialogOpen(false);
                setAdjustmentType(null);
                setAdjustmentForm({
                  bales: '',
                  weight: '',
                  notes: '',
                });
              }}
            >
              취소
            </Button>
            <Button
              onClick={handleAdjustmentSubmit}
              disabled={adjustInventoryMutation.isPending || !adjustmentType || (!adjustmentForm.bales && !adjustmentForm.weight)}
            >
              {adjustInventoryMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  처리 중...
                </>
              ) : (
                '확인'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 판매 항목 수정 다이얼로그 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>판매 항목 수정</DialogTitle>
            <DialogDescription>
              재고 조정으로 생성된 판매 항목을 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editBales">베일</Label>
              <Input
                id="editBales"
                type="number"
                step="0.01"
                placeholder="베일 수량"
                value={editForm.bales}
                onChange={(e) => setEditForm({ ...editForm, bales: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editWeight">중량 (kg)</Label>
              <Input
                id="editWeight"
                type="number"
                step="1"
                placeholder="중량 (kg)"
                value={editForm.weight}
                onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editNotes">비고 (선택)</Label>
              <Textarea
                id="editNotes"
                placeholder="비고"
                rows={3}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="resize-y min-h-[72px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setSelectedSalesItem(null);
                setEditForm({
                  bales: '',
                  weight: '',
                  notes: '',
                });
              }}
            >
              취소
            </Button>
            <Button
              onClick={() => {
                // 빈 문자열이나 유효하지 않은 값은 null로 처리 (지운 값은 null로 저장 허용)
                const balesValue = editForm.bales?.trim();
                const weightValue = editForm.weight?.trim();

                const balesNum = balesValue !== '' && !isNaN(parseFloat(balesValue)) ? parseFloat(balesValue) : null;
                const weightKg = weightValue !== '' && !isNaN(parseFloat(weightValue)) ? parseFloat(weightValue) : null;

                // 재고 입고(INVENTORY_INBOUND)는 음수로 저장
                const isInbound = selectedSalesItem?.status === 'INVENTORY_INBOUND';
                const sign = isInbound ? -1 : 1;
                // 지운 필드는 명시적으로 null 전달 (백엔드에서 해당 컬럼을 null로 업데이트하도록)
                updateSalesItemMutation.mutate({
                  cargoBales: balesNum != null && balesNum >= 0 ? sign * balesNum : null,
                  cargoWeight: weightKg != null && weightKg >= 0 ? (sign * weightKg) / 1000 : null, // 사용자 입력(kg) → 톤으로 전송
                  notes: editForm.notes?.trim() || null,
                });
              }}
              disabled={updateSalesItemMutation.isPending}
            >
              {updateSalesItemMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  처리 중...
                </>
              ) : (
                '확인'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 판매 항목 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>판매 항목 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 판매 항목을 삭제하시겠습니까? 삭제하면 재고가 복구됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedSalesItem(null);
              }}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteSalesItemMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSalesItemMutation.isPending}
            >
              {deleteSalesItemMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  삭제 중...
                </>
              ) : (
                '삭제'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 상세 판매 정보 (판매 이력에서 수정 클릭 시 → 판매 메뉴와 동일하게 상세 먼저, 거기서 수정/판매 취소) */}
      <SalesDetailDrawer
        open={salesDrawerOpen}
        onOpenChange={(open) => {
          setSalesDrawerOpen(open);
          if (!open) {
            setEditingSalesId(null);
            refetch();
          }
        }}
        salesId={editingSalesId}
      />

      {/* 판매 등록 드로어 (현재 컨테이너 미리 선택) */}
      <SalesFormDrawer
        open={salesCreateDrawerOpen}
        onOpenChange={(open) => {
          setSalesCreateDrawerOpen(open);
          if (!open) refetch();
        }}
        mode="create"
        initialData={
          data?.container
            ? (() => {
                // 판매 등록 제품 추가와 동일: 가용 중량·베일 기준으로 컨테이너 vs 카고 구분
                const fullWeight = data.container.weight ?? 0;
                const fullBales = data.container.salesBales ?? data.container.tradeBales ?? 0;
                const availBales = availableBales ?? fullBales;
                const availWeightTons =
                  availableWeightKg != null ? availableWeightKg / 1000 : fullWeight;
                const isPartial =
                  availWeightTons != null &&
                  availWeightTons > 0 &&
                  fullWeight > 0 &&
                  availWeightTons < fullWeight;
                const containerType = isPartial ? 'CARGO' : 'CONTAINER';
                const cargoWeight = isPartial ? availWeightTons : fullWeight;
                const cargoBales = isPartial ? (availBales > 0 ? availBales : fullBales) : fullBales;
                return {
                  productId: data.container.product ?? '',
                  productName: data.container.productName ?? '',
                  selectedContainers: [
                    {
                      id: data.container.id,
                      containerNo: data.container.containerNo,
                      orderId: data.container.orderId ?? '',
                      contractNo: data.container.contractNo,
                      bk: data.container.bk,
                      bl: data.container.bl,
                      sequence: data.container.sequence,
                      productName: data.container.productName,
                      product: data.container.product,
                      tradeGrade: data.container.tradeGrade,
                      tradeGradeName: data.container.tradeGradeName,
                      salesGrade: data.container.salesGrade,
                      salesGradeName: data.container.salesGradeName,
                      weight: data.container.weight,
                      bales: data.container.salesBales ?? data.container.tradeBales ?? null,
                      salesBales: data.container.salesBales,
                      tradeBales: data.container.tradeBales,
                      availableBales: availBales,
                      availableWeight: availWeightTons,
                      pendingPurchaseCost:
                        data.container.pendingPurchaseCost != null
                          ? String(data.container.pendingPurchaseCost)
                          : null,
                      confirmedPurchaseCost:
                        data.container.confirmedPurchaseCost != null
                          ? String(data.container.confirmedPurchaseCost)
                          : null,
                      inboundStatus: 'INBOUND_CONFIRMED',
                      inventoryStatus: data.container.inventoryStatus as
                        | 'RESERVED'
                        | 'AVAILABLE'
                        | 'PARTIALLY_RESERVED'
                        | 'PARTIALLY_SOLD'
                        | 'PARTIALLY_SOLD_COMPLETED'
                        | 'SELLING'
                        | 'SOLD_OUT'
                        | null
                        | undefined,
                      containerType,
                      cargoBales,
                      cargoWeight,
                      unitPrice: data.container.pendingPurchaseCost ?? null,
                      etaDate: data.container.etaDate,
                    },
                  ],
                };
              })()
            : undefined
        }
        onSubmit={async (formData) => {
          const payload: CreateSalesDto = {
            customerId: formData.customerId || null,
            phone: formData.phone || undefined,
            companyName: formData.companyName || undefined,
            ceo: formData.ceo || undefined,
            region: formData.region || undefined,
            customerPostalCode: formData.customerPostalCode || undefined,
            customerAddress: formData.customerAddress || undefined,
            customerAddressRoad: formData.customerAddressRoad || undefined,
            customerAddressJibun: formData.customerAddressJibun || undefined,
            customerLegalBCode: formData.customerLegalBCode || undefined,
            customerAddressDefaultType: formData.customerAddressDefaultType || undefined,
            customerCity: formData.customerCity || undefined,
            addressDetail: formData.addressDetail || undefined,
            unloadingPostalCode: formData.unloadingPostalCode?.trim() ?? '',
            unloadingAddress: formData.unloadingAddress?.trim() ?? '',
            unloadingAddressRoad: formData.unloadingAddressRoad?.trim() ?? '',
            unloadingAddressJibun: formData.unloadingAddressJibun?.trim() ?? '',
            unloadingLegalBCode:
              formData.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) ?? '',
            unloadingAddressDetail: formData.unloadingAddressDetail?.trim() ?? '',
            unloadingRegion: formData.unloadingRegion?.trim() ?? '',
            unloadingCity: formData.unloadingCity?.trim() ?? '',
            unloadingDeliveryAddressId: formData.unloadingDeliveryAddressId?.trim() || null,
            reservationDate:
              formData.reservationDate?.trim() ? formData.reservationDate.trim() : undefined,
            salesDate: formData.salesDate?.trim() ? formData.salesDate.trim() : undefined,
            requestVehicle: formData.requestVehicle || null,
            transportFee: formData.transportFee ?? null,
            advancePaymentRatio: formData.advancePaymentRatio ?? null,
            advancePaymentAmount: formData.advancePaymentAmount ?? null,
            registerAs: formData.registerAs ?? undefined,
            items: (formData.selectedContainers || []).map((c: any) => ({
              containerId: c.id,
              containerType: c.containerType || 'CONTAINER',
              cargoBales: c.cargoBales ?? null,
              cargoWeight: c.cargoWeight ?? null,
              stoCost: c.stoCost ?? null,
              dtCost: c.dtCost ?? null,
              workFee: c.workFee ?? null,
              onsiteWorkFee: c.onsiteWorkFee ?? null,
              advancePaymentRatio: c.advancePaymentRatio ?? null,
              margin: c.margin ?? null,
              salesUnitPrice: c.salesUnitPrice ?? null,
              salesUnitPriceStage: c.salesUnitPriceStage ?? null,
              status: null,
            })),
          };
          await createSalesMutation.mutateAsync(payload);
          setSalesCreateDrawerOpen(false);
          refetch();
        }}
        isSubmitting={createSalesMutation.isPending}
      />
    </Drawer>
  );
}
