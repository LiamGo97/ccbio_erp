'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { useQueryClient } from '@tanstack/react-query';
import { useSalesDelivery, SalesDelivery, useUpdateSalesDelivery, type UpdateSalesDeliveryDto } from '@/lib/hooks/use-sales-delivery';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Edit, X, CheckCircle2, Save, Upload, ShoppingBag } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { useUnloadingCompanies } from '@/lib/hooks/use-unloading-companies';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatNumber, getGcsPublicUrl } from '@/lib/utils';
import { SalesDeliveryEditDrawer } from './sales-delivery-edit-drawer';
import { UnloadingCompleteConfirmDrawer } from './unloading-complete-confirm-drawer';
import { DispatchCompanyDeliveryEditDrawer } from './dispatch-company-delivery-edit-drawer';
import { LoadingCompanyDeliveryEditDrawer } from './loading-company-delivery-edit-drawer';
import { SalesDeliveryStatusAuditSection } from './sales-delivery-status-audit-section';
import { Truck, Warehouse } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits;
};

export interface SalesDeliveryDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId?: string | null;
  title?: string;
  description?: string;
  onSuccess?: () => void;
  /** Drawer 방향: left(왼쪽에서), right(오른쪽에서). 기본 right */
  direction?: 'left' | 'right';
  /** true면 반투명 배경 미표시 (여러 drawer 동시 사용 시) */
  noOverlay?: boolean;
  /** true면 Drawer 없이 패널로만 렌더 (MismatchDetailDrawer 등에서 사용) */
  asPanel?: boolean;
  /** true면 하단에 상차/하차 변경 버튼만 표시 (배차·수정 등 숨김) */
  compactFooter?: boolean;
  /** false면 「운송 상태 변경 이력」 감사 표 숨김 (일반 운송관리 목록 등) */
  showTransportStatusAudit?: boolean;
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

/** ISO 문자열이 타임존 없이 오면 UTC로 간주 (물류관리와 동일) */
const parseAsUtcIfNeeded = (value: string): string => {
  const s = String(value).trim();
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  if (isIsoLike && !hasTimezone) {
    return s.replace(/\.\d{3}$/, '') + 'Z';
  }
  return s;
};

/** 등록일시/수정일시용 - 날짜+시간 표시 (한국시간) */
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

/** API/DB DECIMAL이 "13.50000" 문자열로 올 때 표시에서 끝의 불필요한 0 제거 (scale 최대 4) */
function formatBalesForDisplay(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return '-';
  const n = parseFloat(String(raw).replace(/,/g, ''));
  if (Number.isNaN(n)) return String(raw);
  const r = parseFloat(n.toFixed(4));
  return r % 1 === 0 ? String(Math.trunc(r)) : String(r);
}

export const SalesDeliveryDetailDrawer: React.FC<SalesDeliveryDetailDrawerProps> = ({
  open,
  onOpenChange,
  deliveryId,
  title = '배송관리 상세정보',
  description = '판매 연동 배송 정보를 확인하고 관리합니다.',
  onSuccess,
  direction = 'right',
  noOverlay = false,
  asPanel = false,
  compactFooter = false,
  showTransportStatusAudit = true,
}) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useSalesDelivery(deliveryId ?? null);
  const updateMutation = useUpdateSalesDelivery();
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [unloadingCompleteConfirmOpen, setUnloadingCompleteConfirmOpen] = React.useState(false);
  const [dispatchCompanyEditOpen, setDispatchCompanyEditOpen] = React.useState(false);
  const [loadingCompanyEditOpen, setLoadingCompanyEditOpen] = React.useState(false);
  const [paymentStatusEdit, setPaymentStatusEdit] = React.useState<string>('UNPAID');
  const [weighingCertEditOpen, setWeighingCertEditOpen] = React.useState(false);
  const [weighingCertEditText, setWeighingCertEditText] = React.useState('');
  const [weighingCertEditPaths, setWeighingCertEditPaths] = React.useState<string[]>([]);
  const [weighingCertNewFiles, setWeighingCertNewFiles] = React.useState<File[]>([]);
  const weighingCertFileInputRef = React.useRef<HTMLInputElement>(null);
  const paymentStatusSaving = React.useRef(false);

  React.useEffect(() => {
    if (data?.transportFeePaymentStatus != null) {
      setPaymentStatusEdit(data.transportFeePaymentStatus);
    } else {
      setPaymentStatusEdit('UNPAID');
    }
  }, [data?.id, data?.transportFeePaymentStatus]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (loadingCompanyEditOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setLoadingCompanyEditOpen(false);
        return;
      }
      if (dispatchCompanyEditOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setDispatchCompanyEditOpen(false);
        return;
      }
      if (editDrawerOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setEditDrawerOpen(false);
        return;
      }
      if (unloadingCompleteConfirmOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setUnloadingCompleteConfirmOpen(false);
        return;
      }
      if (weighingCertEditOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setWeighingCertEditOpen(false);
        setWeighingCertNewFiles([]);
        return;
      }
      if (asPanel) {
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
    onOpenChange,
    asPanel,
    loadingCompanyEditOpen,
    dispatchCompanyEditOpen,
    editDrawerOpen,
    unloadingCompleteConfirmOpen,
    weighingCertEditOpen,
  ]);

  const handleSavePaymentStatus = React.useCallback(async () => {
    if (!data?.id || paymentStatusSaving.current) return;
    paymentStatusSaving.current = true;
    try {
      await updateMutation.mutateAsync({
        id: data.id,
        data: { transportFeePaymentStatus: paymentStatusEdit },
      });
      toast({
        title: '저장 완료',
        description: '운송비 지급 상태가 변경되었습니다.',
      });
      void refetch();
    } catch (err: unknown) {
      toast({
        title: '저장 실패',
        description: err instanceof Error ? err.message : '운송비 지급 상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      paymentStatusSaving.current = false;
    }
  }, [data?.id, paymentStatusEdit, updateMutation, refetch]);

  // 계근증 수정 시 기존 데이터 로드
  React.useEffect(() => {
    if (data) {
      setWeighingCertEditText(data.weighingCertInfo ?? '');
      try {
        const paths = data.weighingCertImagePaths
          ? (JSON.parse(data.weighingCertImagePaths) as string[])
          : [];
        setWeighingCertEditPaths(Array.isArray(paths) ? paths : []);
      } catch {
        setWeighingCertEditPaths([]);
      }
    }
  }, [data?.id, data?.weighingCertInfo, data?.weighingCertImagePaths]);

  const handleSaveWeighingCert = async () => {
    if (!data) return;
    try {
      const paths: string[] = [...weighingCertEditPaths];
      for (const file of weighingCertNewFiles) {
        const formData = new FormData();
        formData.append('file', file, file.name);
        const res = await api.post<{ success: boolean; path: string }>(
          '/storage/upload/weighing-certificate',
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        if (res.data.success && res.data.path) paths.push(res.data.path);
      }
      // 삭제된 이미지 GCS에서 제거
      let originalPaths: string[] = [];
      try {
        if (data.weighingCertImagePaths) {
          const parsed = JSON.parse(data.weighingCertImagePaths) as string[];
          if (Array.isArray(parsed)) originalPaths = parsed;
        }
      } catch {
        // ignore
      }
      const pathsSet = new Set(paths);
      const deletedPaths = originalPaths.filter((p) => !pathsSet.has(p));
      for (const path of deletedPaths) {
        await api.delete('/storage/file', { params: { path } });
      }
      await updateMutation.mutateAsync({
        id: data.id.toString(),
        data: {
          weighingCertInfo: weighingCertEditText.trim() || null,
          weighingCertImagePaths: paths.length > 0 ? JSON.stringify(paths) : null,
        },
      });
      toast({ title: '계근증 정보가 저장되었습니다.' });
      setWeighingCertEditOpen(false);
      setWeighingCertNewFiles([]);
      void refetch();
    } catch (err: unknown) {
      toast({
        title: '저장 실패',
        description: err instanceof Error ? err.message : '계근증 정보 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const { data: requestVehicleCodes } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
  const { data: freightPaymentTypeCodes } = useCodeMastersByGroup('FREIGHT_PAYMENT_TYPE');
  const { data: transportFeePaymentStatusCodes } = useCodeMastersByGroup('TRANSPORT_FEE_PAYMENT_STATUS');
  const { data: statusCodes } = useCodeMastersByGroup('SALES_DELIVERY_STATUS');
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  const { data: unloadingCompanies = [] } = useUnloadingCompanies();

  const requestVehicleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (requestVehicleCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [requestVehicleCodes]);

  const warehouseMap = React.useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach((wh) => {
      if (wh.id) map.set(wh.id, wh.name || '');
    });
    return map;
  }, [warehouses]);

  const dispatchCompanyMap = React.useMemo(() => {
    const map = new Map<number, string>();
    dispatchCompanies.forEach((dc) => {
      if (dc.id) map.set(dc.id, dc.name || '');
    });
    return map;
  }, [dispatchCompanies]);

  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (statusCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [statusCodes]);

  const productMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (productCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [productCodes]);

  const getProductName = React.useCallback((productCode?: string | null) => {
    if (!productCode) return '-';
    return productMap.get(productCode.trim()) || productCode;
  }, [productMap]);

  React.useEffect(() => {
    if (open && deliveryId) {
      refetch();
    }
  }, [open, deliveryId, refetch]);

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

  const getRequestVehicleName = (code?: string | null) => {
    if (!code) return '-';
    return requestVehicleMap.get(code) || code;
  };

  const getWarehouseName = (id?: number | string | null) => {
    if (!id) return '-';
    // id가 문자열이면 그대로 반환 (이미 이름인 경우)
    if (typeof id === 'string') {
      return id.trim() || '-';
    }
    // 숫자면 코드 마스터에서 조회
    return warehouseMap.get(id) || '-';
  };

  const getDispatchCompanyName = (id?: number | null) => {
    if (!id) return '-';
    return dispatchCompanyMap.get(id) || data?.dispatchCompany?.name || '-';
  };

  const freightPaymentTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (freightPaymentTypeCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [freightPaymentTypeCodes]);

  const getFreightPaymentTypeName = (code?: string | null) => {
    if (!code) return '-';
    return freightPaymentTypeMap.get(code) || code;
  };

  const getStatusLabel = (status?: string | null) => {
    const statusValue = status || 'PENDING_DISPATCH';
    return statusMap.get(statusValue) || statusValue;
  };

  const getStatusStyle = (status?: string | null): { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string } => {
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
        className: 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300',
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
    const statusValue = status || 'PENDING_DISPATCH';
    if (!statusStyles[statusValue]) {
      return {
        variant: 'outline',
        className: 'border-gray-500 bg-gray-50 text-gray-700 dark:border-gray-400 dark:bg-gray-950/30 dark:text-gray-300',
      };
    }
    return statusStyles[statusValue];
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!data || !deliveryId) return;

    try {
      await updateMutation.mutateAsync({
        id: deliveryId,
        data: { status: newStatus },
      });
      toast({
        title: '상태 변경 완료',
        description: '배송 상태가 변경되었습니다.',
      });
      void refetch();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: '상태 변경 실패',
        description: error.message || '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const headerContent = (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <DrawerTitle>{title}</DrawerTitle>
          {data && (() => {
            const statusStyle = getStatusStyle(data.status);
            return (
              <Badge variant={statusStyle.variant} className={statusStyle.className}>
                {getStatusLabel(data.status)}
              </Badge>
            );
          })()}
        </div>
        <DrawerDescription>{description}</DrawerDescription>
      </div>
      {!asPanel && (
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
      )}
    </div>
  );

  const bodyContent = (
        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !data ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">배송 정보를 찾을 수 없습니다.</p>
              </div>
            ) : (
              <>
            {/* 판매 정보 */}
            {data.sales && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">판매 정보</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">판매일</span>
                      <span className="text-sm font-medium">{formatDate(data.sales.salesDate)}</span>
                    </div>
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 고객 정보 */}
            {data.sales?.customer && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">고객 정보</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">업체명</span>
                      <span className="text-sm font-medium">{data.sales.customer.companyName || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">대표자</span>
                      <span className="text-sm font-medium">{data.sales.customer.ceo || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">연락처</span>
                      <span className="text-sm font-medium">{formatPhone(data.sales.customer.phone)}</span>
                    </div>
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 하차지 정보 — 우편·도로명·지번·상세만 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">하차지 정보</h3>
              <div className="max-w-xs">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">우편번호</span>
                  <span className="text-sm font-medium">
                    {data.sales?.unloadingPostalCode?.trim() || data.unloadingPostalCode?.trim() || '-'}
                  </span>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">도로명 주소</span>
                  <span className="text-sm font-medium">
                    {data.sales?.unloadingAddressRoad?.trim() || '-'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">지번 주소</span>
                  <span className="text-sm font-medium">
                    {data.sales?.unloadingAddressJibun?.trim() || '-'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">상세주소</span>
                <span className="text-sm font-medium">
                  {data.sales?.unloadingAddressDetail?.trim() || data.unloadingAddressDetail?.trim() || '-'}
                </span>
              </div>
            </section>

            <Separator />

            {/* 배차 정보 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">배차 정보</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">운송번호</span>
                  <span className="text-sm font-medium font-mono">{data.orderNumber || '-'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">배차 업체</span>
                  <span className="text-sm font-medium">{getDispatchCompanyName(data.dispatchCompanyId)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">요청 차량</span>
                  <span className="text-sm font-medium">{getRequestVehicleName(data.requestVehicle)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">요청 중량 (KG)</span>
                  <span className="text-sm font-medium">
                    {(() => {
                      const raw = data.requestWeight;
                      if (raw == null || raw === '') return '-';
                      const num = parseFloat(String(raw).trim().replace(/,/g, ''));
                      if (Number.isNaN(num)) return String(raw).trim();
                      return Math.round(num * 1000).toLocaleString('ko-KR');
                    })()}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">운임</span>
                  <span className="text-sm font-medium">{getFreightPaymentTypeName(data.freightPaymentType)}</span>
                </div>
                {(() => {
                  // 관리자가 입력한 상차 일정 표시
                  const firstLoadingItem = data.loadingItems?.[0];
                  const loadingSchedule = firstLoadingItem?.loadingSchedule;
                  const loadingScheduleTime = firstLoadingItem?.loadingScheduleTime;
                  if (loadingSchedule) {
                    return (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">상차 일정</span>
                        <span className="text-sm font-medium">
                          {formatDate(loadingSchedule)}
                          {loadingScheduleTime && ` ${loadingScheduleTime}`}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {(() => {
                  // 배차 업체가 입력한 상차일시 표시
                  const loadingDateTime = data.loadingDateTime;
                  if (loadingDateTime) {
                    return (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">상차일시 (배차 업체 입력)</span>
                        <span className="text-sm font-medium">{loadingDateTime}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {(() => {
                  // 관리자가 입력한 하차 일정 표시
                  const unloadingScheduleDate = data.unloadingScheduleDate;
                  const unloadingScheduleTime = data.unloadingScheduleTime;
                  if (unloadingScheduleDate) {
                    return (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">하차 일정</span>
                        <span className="text-sm font-medium">
                          {formatDate(unloadingScheduleDate)}
                          {unloadingScheduleTime && ` ${unloadingScheduleTime}`}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {(() => {
                  // 배차 업체가 입력한 하차일시 표시
                  const unloadingDateTime = data.unloadingDateTime;
                  if (unloadingDateTime) {
                    return (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">하차일시 (배차 업체 입력)</span>
                        <span className="text-sm font-medium">{unloadingDateTime}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </section>

            <Separator />

            {/* 하역 정보 */}
            {(data.unloadingCompanyId || data.unloadingCompany || data.directUnloadingContact) && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">하역 정보</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">하역 업체</span>
                      <span className="text-sm font-medium">
                        {data.directUnloadingContact ? '직접 하차' : (data.unloadingCompany?.representativeName || '-')}
                      </span>
                    </div>
                    {(data.unloadingCompany?.contact || data.directUnloadingContact) && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">하역 업체 연락처</span>
                        <span className="text-sm font-medium">{formatPhone(data.directUnloadingContact || data.unloadingCompany?.contact)}</span>
                      </div>
                    )}
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 배차 내역 */}
            {(data.vehicleNumber || data.driverContact || data.driverName || data.entryTime || data.loadingDateTime || data.unloadingDateTime || data.transportFee != null || data.weighingFee != null) && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">배차 내역</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    {data.vehicleNumber && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">차량번호</span>
                        <span className="text-sm font-medium">{data.vehicleNumber}</span>
                      </div>
                    )}
                    {data.driverContact && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">운송차 연락처</span>
                        <span className="text-sm font-medium">{formatPhone(data.driverContact)}</span>
                      </div>
                    )}
                    {data.driverName && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">기사명</span>
                        <span className="text-sm font-medium">{data.driverName}</span>
                      </div>
                    )}
                    {data.entryTime && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">입차예정시간</span>
                        <span className="text-sm font-medium">{data.entryTime}</span>
                      </div>
                    )}
                    {data.loadingDateTime && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">상차일시</span>
                        <span className="text-sm font-medium">{data.loadingDateTime}</span>
                      </div>
                    )}
                    {data.unloadingDateTime && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">하차일시</span>
                        <span className="text-sm font-medium">{data.unloadingDateTime}</span>
                      </div>
                    )}
                    {data.transportFee != null && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">운송비</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{formatNumber(data.transportFee)}원</span>
                          {data.transportFeePaymentStatus === 'PAID' && (
                            <span className="text-xs text-green-600 dark:text-green-400">(지급완료)</span>
                          )}
                        </div>
                      </div>
                    )}
                    {data.weighingFee != null && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">계근비</span>
                        <span className="text-sm font-medium">{formatNumber(data.weighingFee)}원</span>
                      </div>
                    )}
                  </div>
                  {data.transportFee != null && (
                    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/30 p-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">운송비 지급</Label>
                        <div className="flex items-center gap-2">
                          <Select
                            value={paymentStatusEdit}
                            onValueChange={(v) => setPaymentStatusEdit(v || 'UNPAID')}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue placeholder="지급 상태" />
                            </SelectTrigger>
                            <SelectContent>
                              {(transportFeePaymentStatusCodes?.length ? transportFeePaymentStatusCodes : [
                                { value: 'UNPAID', name: '미지급' },
                                { value: 'PAID', name: '지급완료' },
                              ]).map((code) => (
                                <SelectItem key={code.value || code.name} value={(code.value || code.name || '').trim()}>
                                  {code.name || code.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            onClick={handleSavePaymentStatus}
                            disabled={updateMutation.isPending || paymentStatusEdit === (data.transportFeePaymentStatus ?? 'UNPAID')}
                          >
                            {updateMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Save className="mr-1.5 h-4 w-4" />
                                저장
                              </>
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">변경 후 저장 버튼을 눌러주세요.</p>
                      </div>
                    </div>
                  )}
                </section>
                <Separator />
              </>
            )}

            {/* 상차 정보 */}
            {data.loadingItems && data.loadingItems.length > 0 && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">상차 정보</h3>
                  <div className="space-y-6">
                    {(() => {
                      const isUnloadingCompleted = data.status === 'UNLOADING_COMPLETED';
                      // 하차완료 시 행 삭제(하차 제외)된 항목은 상차 정보 목록에서 제외
                      const itemsToShow = isUnloadingCompleted
                        ? data.loadingItems.filter(
                            (item) =>
                              item.actualBL != null ||
                              item.actualContainer != null ||
                              item.actualBales != null ||
                              item.actualWeight != null,
                          )
                        : data.loadingItems;
                      return itemsToShow.map((item, index) => {
                      // 상차지: 입고확정 시 설정한 창고 (백엔드에서 item.loadingWarehouse로 채움)
                      const warehouseName = item.loadingWarehouse?.name || getWarehouseName(item.loadingWarehouseId) || '-';
                      // SalesItem 참조로 정보 조회
                      const salesItem = item.salesItem;
                      const container = salesItem?.container;
                      const order = container?.order;
                      
                      // 요청 정보: 저장된 필드 우선. 요청 컨테이너는 저장값만 사용(같은 SalesItem 다른 상차지에서 잘못 같은 요청으로 보이는 것 방지)
                      const requestBL = item.requestBL || order?.bl || '-';
                      const requestContainerRaw = item.requestContainer?.trim() || '';
                      const requestContainer = requestContainerRaw || '-';
                      // 요청 컨테이너 순번: 백엔드에서 컨테이너 FK로 채운 requestContainerSequence 우선
                      const requestContainerSequence =
                        item.requestContainerSequence != null
                          ? item.requestContainerSequence
                          : requestContainerRaw && container?.containerNo != null && String(container.containerNo) === String(requestContainerRaw)
                            ? container.sequence
                            : undefined;
                      const requestContainerType = item.requestContainerType || salesItem?.containerType || 'CONTAINER';
                      const requestContainerTypeLabel = requestContainerType === 'CARGO' ? '카고' : '컨테이너';
                      
                      // 요청 베일/중량: 요청 컨테이너가 없으면 요청 없음이므로 '-'
                      const requestBalesRaw = requestContainerRaw
                        ? (item.requestBales != null ? item.requestBales : (salesItem?.cargoBales || (container != null ? (container.salesBales ?? container.tradeBales) : null) || null))
                        : null;
                      const requestBales = requestBalesRaw != null ? formatBalesForDisplay(requestBalesRaw) : '-';
                      const requestWeightRaw = requestContainerRaw
                        ? (item.requestWeight != null ? item.requestWeight : (salesItem?.cargoWeight != null ? String(salesItem.cargoWeight) : container?.weight != null ? String(container.weight) : null))
                        : null;
                      const requestWeightDisplay = requestWeightRaw != null && String(requestWeightRaw).trim() !== ''
                        ? (() => {
                            const num = parseFloat(String(requestWeightRaw).trim().replace(/,/g, ''));
                            return Number.isNaN(num) ? String(requestWeightRaw).trim() : Math.round(num * 1000).toLocaleString('ko-KR');
                          })()
                        : '-';
                      
                      // 타입 (요청 컨테이너 타입 사용)
                      const containerType = requestContainerType;
                      const containerTypeLabel = requestContainerTypeLabel;
                      
                      // 작업 베일/중량 포맷팅
                      const workBalesFormatted = item.workBales != null ? formatBalesForDisplay(item.workBales) : '-';
                      const workWeightFormattedKg = item.workWeight != null 
                        ? Math.round(parseFloat(String(item.workWeight)) * 1000).toLocaleString('ko-KR')
                        : '-';
                      
                      // 실제 처리 정보 포맷팅 (하차완료 상태일 때만 표시)
                      const actualBalesFormatted = item.actualBales != null ? formatBalesForDisplay(item.actualBales) : '-';
                      const actualWeightFormattedKg = item.actualWeight != null 
                        ? Math.round(parseFloat(String(item.actualWeight)) * 1000).toLocaleString('ko-KR')
                        : '-';
                      const actualTypeLabel = item.actualContainerType === 'CARGO' ? '카고' : item.actualContainerType === 'CONTAINER' ? '컨테이너' : '-';
                      
                      const productName = getProductName(container?.product);

                      return (
                        <div key={item.id} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                              상차지 {index + 1}: {warehouseName}
                              {productName !== '-' ? ` · ${productName}` : ''}
                            </span>
                          </div>
                          <div className="space-y-4">
                            {/* 첫 번째 줄: 요청 정보 */}
                            <div className="grid gap-4 md:grid-cols-5">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 BL</span>
                                <span className="text-sm">{requestBL}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 컨테이너</span>
                                <span className="text-sm">
                                  {requestContainer}
                                  {requestContainerSequence != null ? ` [${requestContainerSequence}]` : ''}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">타입</span>
                                <span className="text-sm">{containerTypeLabel}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 베일</span>
                                <span className="text-sm">{requestBales}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 중량 (KG)</span>
                                <span className="text-sm">{requestWeightDisplay}</span>
                              </div>
                            </div>
                            
                            {/* 두 번째 줄: 작업 정보 */}
                            <div className="grid gap-4 md:grid-cols-5">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 BL</span>
                                <span className="text-sm">{item.workBL || '-'}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 컨테이너</span>
                                <span className="text-sm">
                                  {item.workContainer || '-'}
                                  {item.workContainerSequence != null ? ` [${item.workContainerSequence}]` : ''}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 타입</span>
                                <span className="text-sm">
                                  {item.workContainerType === 'CARGO' ? '카고' : item.workContainerType === 'CONTAINER' ? '컨테이너' : '-'}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 베일</span>
                                <span className="text-sm">{workBalesFormatted}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 중량 (KG)</span>
                                <span className="text-sm">{workWeightFormattedKg}</span>
                              </div>
                            </div>
                            
                            {/* 세 번째 줄: 실제 정보 (하차완료 상태일 때만 표시) */}
                            {isUnloadingCompleted && (
                              <div className="grid gap-4 md:grid-cols-5">
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">실제 BL</span>
                                  <span className="text-sm">{item.actualBL || '-'}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">실제 컨테이너</span>
                                  <span className="text-sm">
                                    {/* 상차지별 실제 컨테이너는 LoadingItem.actualContainer 우선. 순번은 백엔드에서 컨테이너 FK로 채운 displayContainerSequence 사용 */}
                                    {item.actualContainer?.trim()
                                      ? `${item.actualContainer.trim()}${item.displayContainerSequence != null ? ` [${item.displayContainerSequence}]` : ''}`
                                      : item.salesItem?.container
                                        ? `${item.salesItem.container.containerNo ?? '-'}${item.salesItem.container.sequence != null ? ` [${item.salesItem.container.sequence}]` : ''}`
                                        : '-'}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">실제 타입</span>
                                  <span className="text-sm">{actualTypeLabel}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">실제 베일</span>
                                  <span className="text-sm">{actualBalesFormatted}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-muted-foreground">실제 중량 (KG)</span>
                                  <span className="text-sm">{actualWeightFormattedKg}</span>
                                </div>
                              </div>
                            )}
                            
                            {/* 요청 비고 (관리자) / 작업 비고 (상차 업체, work_line) */}
                            {item.requestNotes?.trim() && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">요청 비고</span>
                                <span className="text-sm whitespace-pre-wrap">{item.requestNotes.trim()}</span>
                              </div>
                            )}
                            {data.workLines?.[index]?.notes?.trim() && (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">작업 비고</span>
                                <span className="text-sm whitespace-pre-wrap">{data.workLines[index].notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                    })()}
                  </div>
                </section>
                <Separator />
              </>
            )}

            {showTransportStatusAudit && (
              <>
                <SalesDeliveryStatusAuditSection deliveryId={data.id} open={open} />
                <Separator />
              </>
            )}

            {/* 계근증 관련 정보 (저장된 데이터가 있을 때 표시, 상차완료로 되돌려도 확인 가능) */}
            {(data.weighingCertInfo || data.weighingCertImagePaths) && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">계근증 관련 정보</h3>
                  {weighingCertEditOpen ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>계근증 관련 정보 텍스트</Label>
                        <Textarea
                          value={weighingCertEditText}
                          onChange={(e) => setWeighingCertEditText(e.target.value)}
                          placeholder="계근증 관련 메모, 카톡/문자 내용 등을 입력하세요"
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>계근증 이미지</Label>
                        <div className="flex flex-wrap gap-2">
                          {weighingCertEditPaths.map((path, idx) => (
                            <div key={path} className="relative group">
                              <a href={getGcsPublicUrl(path)} target="_blank" rel="noopener noreferrer" className="block">
                                <img
                                  src={getGcsPublicUrl(path)}
                                  alt={`계근증 ${idx + 1}`}
                                  className="w-20 h-20 object-cover rounded border"
                                />
                              </a>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute -top-1 -right-1 h-5 w-5"
                                onClick={() => setWeighingCertEditPaths((p) => p.filter((_, i) => i !== idx))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          {weighingCertNewFiles.map((file, idx) => (
                            <div key={`new-${idx}`} className="relative">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                className="w-20 h-20 object-cover rounded border"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute -top-1 -right-1 h-5 w-5"
                                onClick={() => setWeighingCertNewFiles((f) => f.filter((_, i) => i !== idx))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Input
                            ref={weighingCertFileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const files = e.target.files;
                              if (files?.length) {
                                setWeighingCertNewFiles((prev) => [...prev, ...Array.from(files) as File[]]);
                              }
                              e.target.value = '';
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => weighingCertFileInputRef.current?.click()}
                            className="w-20 h-20 flex flex-col items-center justify-center gap-1"
                          >
                            <Upload className="h-5 w-5" />
                            <span className="text-xs">추가</span>
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveWeighingCert} disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                          저장
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setWeighingCertEditOpen(false); setWeighingCertNewFiles([]); }}>
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {data.weighingCertInfo && (
                        <div>
                          <span className="text-xs text-muted-foreground">텍스트</span>
                          <p className="text-sm whitespace-pre-wrap mt-0.5">{data.weighingCertInfo}</p>
                        </div>
                      )}
                      {data.weighingCertImagePaths && (() => {
                        try {
                          const paths = JSON.parse(data.weighingCertImagePaths) as string[];
                          if (!Array.isArray(paths) || paths.length === 0) return null;
                          return (
                            <div>
                              <span className="text-xs text-muted-foreground">이미지</span>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {paths.map((path, idx) => (
                                  <a key={path} href={getGcsPublicUrl(path)} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={getGcsPublicUrl(path)}
                                      alt={`계근증 ${idx + 1}`}
                                      className="w-20 h-20 object-cover rounded border hover:opacity-90"
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                      <Button size="sm" variant="outline" onClick={() => setWeighingCertEditOpen(true)}>
                        <Edit className="h-4 w-4 mr-1" />
                        수정
                      </Button>
                    </div>
                  )}
                </section>
                <Separator />
              </>
            )}

            {/* 비고 */}
            {data.notes && (
              <>
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">비고</h3>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium whitespace-pre-wrap">{data.notes}</span>
                  </div>
                </section>
                <Separator />
              </>
            )}

            {/* 시스템 정보 */}
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-foreground">시스템 정보</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">생성자</span>
                  <span className="text-sm font-medium">{data.createdByUser?.name || '-'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">등록일시</span>
                  <span className="text-sm font-medium">{formatDateTime(data.createdAt)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">수정일시</span>
                  <span className="text-sm font-medium">{formatDateTime(data.updatedAt)}</span>
                </div>
              </div>
            </section>
            </>
            )}
            </div>
          </ScrollArea>
        </div>
  );

  const footerContent = (
    <div className="flex justify-between gap-2">
      {!asPanel && (
        <DrawerClose asChild>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1.5 h-4 w-4" />
            취소
          </Button>
        </DrawerClose>
      )}
      <div className="flex gap-2">
        {data && (data.sales?.id ?? data.salesId) && (
          <Button
            type="button"
            variant="outline"
            disabled={!data}
            onClick={() => {
              const sid = data.sales?.id ?? data.salesId;
              if (sid) {
                router.push(`/sales?open=${sid}`);
                onOpenChange(false);
              }
            }}
          >
            <ShoppingBag className="mr-1.5 h-4 w-4" />
            판매 보기
          </Button>
        )}
        {!compactFooter && (
          <>
            {data && data.status !== 'PENDING_DISPATCH' && (
              <>
                <Button
                  variant="outline"
                  disabled={!data || updateMutation.isPending}
                  onClick={() => data && setDispatchCompanyEditOpen(true)}
                >
                  <Truck className="mr-1.5 h-4 w-4" />
                  배차 업체 수정
                </Button>
                <Button
                  variant="outline"
                  disabled={!data || updateMutation.isPending}
                  onClick={() => data && setLoadingCompanyEditOpen(true)}
                >
                  <Warehouse className="mr-1.5 h-4 w-4" />
                  상차업체 수정
                </Button>
                <Button
                  variant="outline"
                  disabled={!data || updateMutation.isPending}
                  onClick={() => setEditDrawerOpen(true)}
                >
                  <Edit className="mr-1.5 h-4 w-4" />
                  수정
                </Button>
              </>
            )}
            {data?.status === 'PENDING_DISPATCH' && (
              <Button
                variant="default"
                disabled={!data || updateMutation.isPending}
                onClick={() => setEditDrawerOpen(true)}
              >
                <Edit className="mr-1.5 h-4 w-4" />
                배차 요청
              </Button>
            )}
          </>
        )}
        {data?.status === 'LOADING_COMPLETED' && (
          <Button
            variant="default"
            disabled={!data || updateMutation.isPending}
            onClick={() => setUnloadingCompleteConfirmOpen(true)}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            하차완료
          </Button>
        )}
        {data?.status === 'UNLOADING_COMPLETED' && (
          <Button
            variant="outline"
            disabled={!data || updateMutation.isPending}
            onClick={() => handleStatusChange('LOADING_COMPLETED')}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            상차완료로 변경
          </Button>
        )}
      </div>
    </div>
  );

  const mainContent = asPanel ? (
    <div className="flex flex-col h-full min-w-0">
      <div className="border-b flex-shrink-0 px-4 py-3">{headerContent}</div>
      {bodyContent}
      <div className="border-t flex-shrink-0 px-4 py-3">{footerContent}</div>
    </div>
  ) : (
    <Drawer open={open} onOpenChange={onOpenChange} direction={direction} dismissible={false}>
      <DrawerContent
        className="h-full flex flex-col"
        noOverlay={noOverlay}
        style={{
          width: isMobile ? '100%' : '900px',
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b flex-shrink-0">{headerContent}</DrawerHeader>
        {bodyContent}
        <DrawerFooter className="border-t border-border">{footerContent}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );

  return (
    <>
    {mainContent}
    {/* 수정 폼 */}
    {data && (
      <SalesDeliveryEditDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        delivery={data}
        onSuccess={() => {
          void refetch();
          onSuccess?.();
        }}
      />
    )}

    {/* 하차완료 확인 화면 */}
    {data && (
      <UnloadingCompleteConfirmDrawer
        open={unloadingCompleteConfirmOpen}
        onOpenChange={setUnloadingCompleteConfirmOpen}
        delivery={data}
      onConfirm={async (actualApplyItems, removedItemIds, addedRowIds, weighingCertData) => {
        if (!data) return;

        try {
          // 계근증 이미지 업로드 (GCS weighing-certificates 폴더)
          let weighingCertImagePaths: string[] | undefined;
          const allPaths: string[] = [...(weighingCertData?.existingImagePaths ?? [])];
          if (weighingCertData?.imageFiles && weighingCertData.imageFiles.length > 0) {
            for (const file of weighingCertData.imageFiles) {
              const formData = new FormData();
              formData.append('file', file, file.name);
              const res = await api.post<{ success: boolean; path: string }>(
                '/storage/upload/weighing-certificate',
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
              );
              if (res.data.success && res.data.path) allPaths.push(res.data.path);
            }
          }
          weighingCertImagePaths = allPaths.length > 0 ? allPaths : undefined;

          const removedSet = new Set((removedItemIds ?? []).map((id) => String(id)));
          const itemsToUpdate = (data.loadingItems ?? []).filter((item) => !removedSet.has(String(item.id)));
          const firstItem = itemsToUpdate[0] ?? (data.loadingItems ?? [])[0];
          let updatedLoadingItems: UpdateSalesDeliveryDto['loadingItems'] = undefined;
          const hasAdded = (addedRowIds?.length ?? 0) > 0;
          // 행 삭제(removedLoadingItemIds) 시에도 loadingItems 전송 필요 → 판매 항목 취소 반영
          // 하차완료 시에는 실제 정보(actual*)만 전송 (요청/작업은 상차 수정 시에만 전송)
          if (itemsToUpdate.length > 0 || hasAdded) {
            const list: NonNullable<UpdateSalesDeliveryDto['loadingItems']> = [];
            itemsToUpdate.forEach((item, index) => {
              const actualItem = actualApplyItems?.find((a) => String(a.loadingItemId) === String(item.id));
              // actual 비어있으면 request fallback (아무것도 안 입력하고 하차완료해도 상차지/컨테이너 표시)
              const reqBL = item.requestBL ?? item.salesItem?.container?.order?.bl;
              const reqContainer = item.salesItem?.container?.containerNo ?? item.requestContainer;
              const resolvedActualContainer =
                actualItem?.actualContainerId && String(item.salesItem?.container?.id) === actualItem.actualContainerId
                  ? (item.salesItem?.container?.containerNo ?? actualItem.actualContainer?.trim())
                  : (actualItem?.actualContainer?.trim() || reqContainer);
              list.push({
                id: String(item.id),
                salesItemId: item.salesItemId,
                actualBL: (actualItem?.actualBL?.trim() || reqBL) || undefined,
                actualContainer: (resolvedActualContainer || reqContainer) || undefined,
                actualContainerId: actualItem?.actualContainerId?.trim() || undefined,
                actualContainerType: actualItem?.actualType || undefined,
                actualBales: actualItem?.actualBales !== undefined && actualItem.actualBales !== '' ? parseFloat(actualItem.actualBales) : (item.requestBales ?? (item.salesItem?.cargoBales != null ? parseFloat(String(item.salesItem.cargoBales)) : undefined)),
                actualWeight: actualItem?.actualWeight !== undefined && actualItem.actualWeight !== '' ? parseFloat(actualItem.actualWeight) : (item.requestWeight ?? (item.salesItem?.cargoWeight != null ? parseFloat(String(item.salesItem.cargoWeight)) : undefined)),
                order: item.order || index + 1,
              });
            });
            addedRowIds?.forEach((newId, idx) => {
              const actualItem = actualApplyItems?.find((a) => a.loadingItemId === newId);
              if (!actualItem || !firstItem) return;
              list.push({
                parentSalesItemId: firstItem.salesItemId,
                actualBL: actualItem.actualBL?.trim() || undefined,
                actualContainer: actualItem.actualContainer?.trim() || undefined,
                actualContainerId: actualItem.actualContainerId?.trim() || undefined,
                actualContainerType: actualItem.actualType || undefined,
                actualBales: actualItem.actualBales !== undefined && actualItem.actualBales !== '' ? parseFloat(actualItem.actualBales) : undefined,
                actualWeight: actualItem.actualWeight !== undefined && actualItem.actualWeight !== '' ? parseFloat(actualItem.actualWeight) : undefined,
                notes: actualItem.actualNotes?.trim() || undefined,
                order: itemsToUpdate.length + idx + 1,
              });
            });
            updatedLoadingItems = list;
          }

          // 하차완료 상태면 실제 정보만 업데이트, 아니면 하차완료로 변경
          const isUnloadingCompleted = data.status === 'UNLOADING_COMPLETED';
          const payload = {
            ...(isUnloadingCompleted ? {} : { status: 'UNLOADING_COMPLETED' }),
            loadingItems: updatedLoadingItems,
            removedLoadingItemIds: Array.from(removedItemIds ?? []),
            weighingCertInfo: weighingCertData?.infoText?.trim() ?? undefined,
            weighingCertImagePaths: weighingCertImagePaths != null ? JSON.stringify(weighingCertImagePaths) : undefined,
          };
          console.log('[하차완료 디버그] 요청 전송 - 배송 ID:', data.id, '판매 ID:', data.salesId, '현재 상태:', data.status, 'status 포함:', !isUnloadingCompleted, 'payload:', payload);
          await updateMutation.mutateAsync({
            id: data.id.toString(),
            data: payload,
          });
          
          toast({
            title: isUnloadingCompleted ? '하차완료정보 수정 완료' : '하차완료 처리 완료',
            description: isUnloadingCompleted ? '하차완료정보가 수정되었습니다.' : '하차완료로 변경되었습니다.',
          });
          
          setUnloadingCompleteConfirmOpen(false);
          void refetch();
          // 하차완료(또는 하차정보 수정) 시 판매에 항목이 추가/변경될 수 있으므로 해당 판매 쿼리 무효화 → 판매 화면에서 즉시 반영
          if (data?.salesId) {
            void queryClient.invalidateQueries({ queryKey: ['sales', 'detail', String(data.salesId)] });
            void queryClient.invalidateQueries({ queryKey: ['sales'] });
          }
          onSuccess?.();
        } catch (error: any) {
          toast({
            title: '오류',
            description: error.message || '하차완료 처리 중 오류가 발생했습니다.',
            variant: 'destructive',
          });
        }
      }}
      isSubmitting={updateMutation.isPending}
      />
    )}

    {/* 배차 업체 수정 Drawer */}
    {data && (
      <DispatchCompanyDeliveryEditDrawer
        open={dispatchCompanyEditOpen}
        onOpenChange={(open) => {
          setDispatchCompanyEditOpen(open);
          if (!open) {
            void refetch();
          }
        }}
        delivery={data}
        onSuccess={() => {
          void refetch();
          onSuccess?.();
        }}
      />
    )}

    {/* 상차업체 수정 Drawer - 운송관리(관리자)에서는 warehouseId 미전달 → 전체 상차지 표시 */}
    {data && (
      <LoadingCompanyDeliveryEditDrawer
        open={loadingCompanyEditOpen}
        onOpenChange={(open) => {
          setLoadingCompanyEditOpen(open);
          if (!open) {
            void refetch();
          }
        }}
        delivery={data}
        warehouseId={undefined}
        onSuccess={() => {
          void refetch();
          onSuccess?.();
        }}
      />
    )}
  </>
  );
};

