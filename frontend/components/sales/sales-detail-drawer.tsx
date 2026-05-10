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
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSalesDetail, SalesDetail, useUpdateSales, useCreateSales, useConfirmSales, CreateSalesDto, UpdateSalesDto } from '@/lib/hooks/use-sales';
import { Loader2, Edit, X, XCircle, ExternalLink, CheckCircle2, AlertCircle, Copy, CalendarClock, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { SalesFormDrawer } from '@/components/sales/sales-form-drawer';
import { ReturnRegisterDialog } from '@/components/sales/return-register-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PackageX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SalesDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesId?: string | null;
  onEdit?: (sales: SalesDetail) => void;
  onEditDrawerOpen?: (salesId: string) => void;
  onConfirmDrawerOpen?: (salesId: string) => void;
  onCopySales?: (sales: SalesDetail) => void;
  /** Drawer 방향: left(왼쪽에서), right(오른쪽에서). 기본 right */
  direction?: 'left' | 'right';
  /** true면 반투명 배경 미표시 (여러 drawer 동시 사용 시) */
  noOverlay?: boolean;
  /** true면 Drawer 없이 패널로만 렌더 (MismatchDetailDrawer 등에서 사용) */
  asPanel?: boolean;
  /** true면 읽기 전용 (수정/확정 버튼 숨김) */
  readOnly?: boolean;
}

const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground break-all">{value ?? '-'}</span>
  </div>
);

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

const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
  if (value === null || value === undefined) return '-';
  const formatted = value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return formatted;
};

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 5) {
      return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    }
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  } else if (digits.length > 10) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  } else if (digits.length > 7) {
    return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  } else if (digits.length > 3) {
    return digits.replace(/(\d{3})(\d+)/, '$1-$2');
  }
  return digits;
};

export function SalesDetailDrawer({
  open,
  onOpenChange,
  salesId,
  onEdit,
  onEditDrawerOpen,
  onConfirmDrawerOpen,
  onCopySales,
  direction = 'right',
  noOverlay = false,
  asPanel = false,
  readOnly = false,
}: SalesDetailDrawerProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { data, isLoading, refetch } = useSalesDetail(salesId ?? undefined);
  const updateSalesMutation = useUpdateSales();
  const createSalesMutation = useCreateSales();
  const confirmSalesMutation = useConfirmSales();
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [reserveConfirmOpen, setReserveConfirmOpen] = React.useState(false);
  const [prepaymentCancellationMethod, setPrepaymentCancellationMethod] = React.useState<'REFUND' | 'KEEP_FOR_NEXT' | null>(null);
  const [cancellationReason, setCancellationReason] = React.useState('');
  
  // 중첩 drawer state
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);
  const [confirmDrawerOpen, setConfirmDrawerOpen] = React.useState(false);
  const [editMode, setEditMode] = React.useState<'edit' | 'confirm'>('edit');
  const [returnDialogOpen, setReturnDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (cancelDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setCancelDialogOpen(false);
        setPrepaymentCancellationMethod(null);
        setCancellationReason('');
        return;
      }
      if (reserveConfirmOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setReserveConfirmOpen(false);
        return;
      }
      if (returnDialogOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setReturnDialogOpen(false);
        return;
      }
      // 중첩 SalesFormDrawer는 자체 Esc 순서(검색·주소 모달 등)가 있으므로 여기서는 막지 않음
      if (editDrawerOpen || confirmDrawerOpen) {
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
    cancelDialogOpen,
    reserveConfirmOpen,
    returnDialogOpen,
    editDrawerOpen,
    confirmDrawerOpen,
  ]);

  const { data: salesItemStatusCodes } = useCodeMastersByGroup('SALES_ITEM_STATUS');
  const { data: productCodes = [] } = useCodeMastersByGroup('PRODUCT');
  const { data: packingCodes = [] } = useCodeMastersByGroup('PACKING_TYPE');
  const { data: tradeGradeCodes = [] } = useCodeMastersByGroup('TRADE_GRADE');
  const { data: salesGradeCodes = [] } = useCodeMastersByGroup('SALES_GRADE');
  const { data: warehouses = [] } = useWarehouses({ status: true });
  const { data: requestVehicleCodes = [] } = useCodeMastersByGroup('CONSULTATION_REQUEST_WEIGHT');
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

  const productMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (productCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [productCodes]);

  const requestVehicleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (requestVehicleCodes ?? []).forEach((c) => {
      const key = (c.value ?? c.name ?? '').trim();
      const label = (c.name ?? c.value ?? '').trim();
      if (key) map.set(key, label || key);
    });
    return map;
  }, [requestVehicleCodes]);

  const getStatusLabel = (status?: string | null) => {
    if (!status) return '-';
    // tb_code에 없는 재고 조정 상태 fallback
    if (status === 'INVENTORY_CONSUMPTION') return '재고 소모';
    if (status === 'INVENTORY_INBOUND') return '재고 입고';
    return statusMap.get(status) || status;
  };

  const getProductName = (productCode?: string | null) => {
    if (!productCode) return '-';
    return productMap.get(productCode) || productCode;
  };

  const getRequestVehicleName = (requestVehicleCode?: string | null) => {
    if (!requestVehicleCode) return '-';
    return requestVehicleMap.get(requestVehicleCode) || requestVehicleCode;
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

  const getStatusBadge = (status?: string | null) => {
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
      INVENTORY_CONSUMPTION: {
        variant: 'outline',
        className: 'border-slate-500 bg-slate-50 text-slate-700 dark:border-slate-400 dark:bg-slate-950/30 dark:text-slate-300',
      },
      INVENTORY_INBOUND: {
        variant: 'outline',
        className: 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300',
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
  };

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && salesId) {
      refetch();
    }
  }, [open, salesId, refetch]);

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

  const totalAmount = React.useMemo(() => {
    if (!data?.productInfo) return 0;
    return data.productInfo.reduce((sum, product) => {
      if (product.salesUnitPrice && product.weight) {
        return sum + (product.salesUnitPrice * product.weight * 1000);
      }
      return sum;
    }, 0);
  }, [data?.productInfo]);

  const totalAdvancePayment = React.useMemo(() => {
    if (!data?.productInfo) return 0;
    return data.productInfo.reduce((sum, product) => {
      if (product.salesUnitPrice && product.weight && product.advancePaymentRatio) {
        const salesPrice = product.salesUnitPrice * product.weight * 1000;
        return sum + (salesPrice * product.advancePaymentRatio / 100);
      }
      return sum;
    }, 0);
  }, [data?.productInfo]);

  // 입고 확정 상태 확인
  const inboundStatusInfo = React.useMemo(() => {
    if (!data?.productInfo || data.productInfo.length === 0) {
      return { allConfirmed: false, hasConfirmed: false, hasScheduled: false, canConfirm: false };
    }

    // SALES_ITEM_RESERVED: 일반 예약, SALES_ITEM_SOLD: 입고 확정된 컨테이너로 추가된 경우
    const eligibleStatuses = ['SALES_ITEM_RESERVED', 'SALES_ITEM_SOLD'];
    const allEligible = data.productInfo.every((p) => p.status && eligibleStatuses.includes(p.status));
    const allConfirmed = data.productInfo.every((p) => p.inboundStatus === 'INBOUND_CONFIRMED');
    const hasConfirmed = data.productInfo.some((p) => p.inboundStatus === 'INBOUND_CONFIRMED');
    const hasScheduled = data.productInfo.some((p) => p.inboundStatus === 'INBOUND_SCHEDULED');
    
    // 판매 확정 가능 조건: 모든 항목이 예약/판매 상태이고, 모든 컨테이너가 입고 확정, 아직 확정 전(salesStatus !== 'SOLD')
    const canConfirm =
      allEligible &&
      allConfirmed &&
      (data.status === 'SALES_ITEM_RESERVED' || data.status === 'SALES_ITEM_SOLD') &&
      data.salesStatus !== 'SOLD';

    return { allConfirmed, hasConfirmed, hasScheduled, canConfirm };
  }, [data?.productInfo, data?.status, data?.salesStatus]);

  /** 판매예약·판매·판매완료 모두 동일. 전체 취소 완료·항목 취소만 숨김 (선입금 차감 등은 백엔드에서 검증) */
  const showSalesCancelButton = React.useMemo(() => {
    if (!data) return false;
    if (data.cancelledAt) return false;
    if (data.status === 'SALES_ITEM_CANCELLED') return false;
    return true;
  }, [data]);

  const returnRegisterItemOptions = React.useMemo(() => {
    if (!data?.productInfo?.length) return [];
    return data.productInfo.map((p, i) => ({
      id: p.itemId ?? p.containerId ?? `idx-${i}`,
      label: `${p.containerNo ?? '-'} - ${p.productName ?? p.bl ?? '-'}`,
    }));
  }, [data?.productInfo]);

  const headerContent = (
    <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-3">
            <DrawerTitle>판매 상세정보</DrawerTitle>
            {data && getStatusBadge(data.status)}
            {!asPanel && data && data.status !== 'SALES_ITEM_CANCELLED' && onCopySales && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                disabled={updateSalesMutation.isPending}
                onClick={() => {
                  if (data && onCopySales) {
                    onCopySales(data);
                  }
                }}
                title="복사하여 등록"
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
          <DrawerDescription>
            {readOnly ? '판매 정보를 확인합니다.' : '판매 정보를 확인하고 수정할 수 있습니다.'}
          </DrawerDescription>
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
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="p-6 space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !data ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">판매 정보를 찾을 수 없습니다.</p>
                </div>
              ) : (
                <>
                  {/* 고객 정보 */}
                  <section className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">고객 정보</h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <InfoRow label="고객명" value={data.customerName} />
                      <InfoRow label="대표자" value={data.customerCeo} />
                      <InfoRow label="전화번호" value={formatPhone(data.customerPhone)} />
                    </div>
                  </section>

                  <Separator />

                  {/* 하차지 주소 */}
                  <section className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">하차지 주소</h3>
                    </div>
                    <div className="max-w-xs">
                      <InfoRow
                        label="우편번호"
                        value={data.unloadingPostalCode?.trim() || '-'}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <InfoRow
                        label="도로명 주소"
                        value={
                          data.unloadingAddressRoad?.trim() ||
                          data.unloadingAddress?.trim() ||
                          '-'
                        }
                      />
                      <InfoRow
                        label="지번 주소"
                        value={data.unloadingAddressJibun?.trim() || '-'}
                      />
                    </div>
                    <div>
                      <InfoRow
                        label="상세주소"
                        value={data.unloadingAddressDetail?.trim() || '-'}
                      />
                    </div>
                  </section>

                  <Separator />

                  {/* 판매 정보 */}
                  <section className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">판매 정보</h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <InfoRow label="판매 ID" value={data.id} />
                      <InfoRow label="예약일" value={formatDate(data.reservationDate)} />
                      <InfoRow label="판매일" value={formatDate(data.salesDate)} />
                      <InfoRow label="요청 차량" value={getRequestVehicleName(data.requestVehicle)} />
                      <InfoRow label="운송비" value={data.transportFee != null ? formatNumber(data.transportFee, 2) : '-'} />
                      <InfoRow label="등록자" value={data.registeredByName} />
                      <InfoRow label="등록일" value={formatDate(data.createdAt)} />
                    </div>
                  </section>

                  <Separator />

                  {/* 입고 확정 안내 메시지: 판매예약일 때만 표시 */}
                  {data.status === 'SALES_ITEM_RESERVED' && inboundStatusInfo.hasConfirmed && (
                    <>
                      <div className={`rounded-lg border p-4 ${
                        inboundStatusInfo.allConfirmed 
                          ? 'border-green-500 bg-green-50 dark:bg-green-950/30' 
                          : 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                      }`}>
                        <div className="flex items-start gap-3">
                          {inboundStatusInfo.allConfirmed ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 space-y-1">
                            <p className={`text-sm font-medium ${
                              inboundStatusInfo.allConfirmed 
                                ? 'text-green-700 dark:text-green-300' 
                                : 'text-orange-700 dark:text-orange-300'
                            }`}>
                              {inboundStatusInfo.allConfirmed 
                                ? '입고 확정 완료' 
                                : '일부 입고 확정'}
                            </p>
                            <p className={`text-xs ${
                              inboundStatusInfo.allConfirmed 
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-orange-600 dark:text-orange-400'
                            }`}>
                              {inboundStatusInfo.allConfirmed 
                                ? '모든 재고가 입고 확정되었습니다. 판매 확정이 가능합니다.' 
                                : '일부 재고만 입고 확정되었습니다. 모든 재고가 입고 확정되면 판매 확정이 가능합니다.'}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}

                  {/* 상품 정보 */}
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">상품 정보</h3>
                      {/* 반품 등록 버튼: 다시 보이게 하려면 아래 조건에서 false && 제거 */}
                      {false && (data?.productInfo?.length ?? 0) > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReturnDialogOpen(true)}
                          className="h-8 text-xs"
                        >
                          <PackageX className="mr-1.5 h-3.5 w-3.5" />
                          반품 등록
                        </Button>
                      )}
                    </div>
                    {data.productInfo && data.productInfo.length > 0 ? (
                      <div className="space-y-4">
                        {data.productInfo.map((product, idx) => {
                          const salesPrice = product.salesUnitPrice && product.weight
                            ? product.salesUnitPrice * product.weight * 1000
                            : 0;
                          const advancePayment = product.advancePaymentRatio && salesPrice > 0
                            ? salesPrice * product.advancePaymentRatio / 100
                            : 0;

                          return (
                            <div key={idx} className="border rounded-lg p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const inboundStatus = product.inboundStatus;
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

                                    if (!inboundStatus || !statusStyles[inboundStatus]) {
                                      return null;
                                    }

                                    const style = statusStyles[inboundStatus];
                                    const statusLabel = inboundStatus === 'INBOUND_PENDING' ? '입고대기' : inboundStatus === 'INBOUND_SCHEDULED' ? '입고예정' : '입고확정';

                                    return (
                                      <Badge variant={style.variant} className={style.className}>
                                        {statusLabel}
                                      </Badge>
                                    );
                                  })()}
                                  <span className="text-sm font-medium">
                                    {product.containerNo}
                                    {product.sequence != null && ` [${product.sequence}]`}
                                  </span>
                                </div>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                <InfoRow label="계약번호" value={product.contractNo || '-'} />
                                <InfoRow label="BL" value={product.bl || '-'} />
                                <InfoRow label="ETA" value={formatDate(product.etaDate)} />
                                <InfoRow
                                label="창고"
                                value={
                                  product.inboundWarehouseName ??
                                  (product.inboundWarehouse
                                    ? warehouses.find(
                                        (w) =>
                                          w.name === product.inboundWarehouse ||
                                          w.id.toString() === product.inboundWarehouse
                                      )?.name ?? product.inboundWarehouse
                                    : null) ?? '-'
                                }
                              />
                                <InfoRow label="상품명" value={getProductName(product.productName)} />
                                <InfoRow label="패킹 타입" value={product.packingName || product.packingType || '-'} />
                                <InfoRow label="등급(무역)" value={product.tradeGradeName || product.tradeGrade} />
                                <InfoRow label="등급(영업)" value={product.salesGradeName || product.salesGrade} />
                                <InfoRow label="타입" value={product.containerType === 'CARGO' ? '카고' : '컨테이너'} />
                                <InfoRow label="베일(영업)" value={(() => {
                                  const isCargo = product.containerType === 'CARGO';
                                  const b = isCargo
                                    ? (product.soldBales ?? product.cargoBales ?? null)
                                    : (product.soldBales ?? product.cargoBales ?? product.bales ?? product.salesBales ?? product.tradeBales);
                                  return b != null ? Math.round(Number(b)).toLocaleString('ko-KR') : '-';
                                })()} />
                                <InfoRow label="중량 (KG)" value={product.weight != null ? formatNumber(product.weight * 1000, 0) : '-'} />
                                <InfoRow label="환율" value={formatNumber(product.exchangeRate, 6)} />
                                <InfoRow
                                  label="구분"
                                  value={
                                    product.salesUnitPriceStage ? (
                                      <Badge
                                        variant="outline"
                                        className={
                                          product.salesUnitPriceStage === 'LOADING'
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                                            : product.salesUnitPriceStage === 'ARRIVAL'
                                              ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300'
                                              : product.salesUnitPriceStage === 'UNLOADING'
                                                ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300'
                                                : 'border-slate-500 bg-slate-50 text-slate-700 dark:border-slate-400 dark:bg-slate-950/30 dark:text-slate-300'
                                        }
                                      >
                                        {getSalesPriceStageName(product.salesUnitPriceStage)}
                                      </Badge>
                                    ) : (
                                      '-'
                                    )
                                  }
                                />
                                <InfoRow label="판매단가" value={formatNumber(product.salesUnitPrice, 2)} />
                                <InfoRow label="마진" value={formatNumber(product.margin, 2)} />
                              </div>
                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
                                {(product.stoCost !== null && product.stoCost !== undefined) && (
                                  <InfoRow label="STO 비용" value={formatNumber(product.stoCost, 2)} />
                                )}
                                {(product.dtCost !== null && product.dtCost !== undefined) && (
                                  <InfoRow label="DT 비용" value={formatNumber(product.dtCost, 2)} />
                                )}
                                {(product.workFee !== null && product.workFee !== undefined) && (
                                  <InfoRow label="창고 작업비" value={formatNumber(product.workFee, 2)} />
                                )}
                                {(product.onsiteWorkFee !== null && product.onsiteWorkFee !== undefined) && (
                                  <InfoRow label="현장 작업비" value={formatNumber(product.onsiteWorkFee, 2)} />
                                )}
                                {advancePayment > 0 && (
                                  <InfoRow label="선입금" value={formatNumber(advancePayment, 2)} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">상품 정보가 없습니다.</p>
                    )}
                  </section>

                  <Separator />

                  {/* 선입금 정보 (선입금이 있을 때 표시) */}
                  {(data.prepayment || data.advancePaymentRatio != null || data.advancePaymentAmount != null) && (
                    <>
                      <section className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-foreground">선입금 정보</h3>
                          {data.prepayment && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                router.push(`/finance/prepayments?prepaymentId=${data.prepayment?.id}`);
                                onOpenChange(false);
                              }}
                              className="h-7 text-xs"
                            >
                              <ExternalLink className="mr-1.5 h-3 w-3" />
                              상세보기
                            </Button>
                          )}
                        </div>
                        {data.prepayment ? (
                          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                            <div className="grid gap-4 md:grid-cols-2">
                              <InfoRow 
                                label="청구 금액" 
                                value={data.prepayment.prepaymentAmount != null ? `${formatNumber(data.prepayment.prepaymentAmount, 0)}원` : '-'} 
                              />
                              <InfoRow 
                                label="상태" 
                                value={
                                  <Badge 
                                    variant="outline"
                                    className={
                                      data.prepayment.deductionStatus === 'DEDUCTED'
                                        ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-950/30 dark:text-green-300'
                                        : data.prepayment.paymentStatus === 'REQUESTED' 
                                        ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950/30 dark:text-amber-300'
                                        : data.prepayment.paymentStatus === 'CONFIRMED'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                                        : data.prepayment.paymentStatus === 'AVAILABLE'
                                        ? 'border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950/30 dark:text-purple-300'
                                        : data.prepayment.paymentStatus === 'CANCELLED'
                                        ? 'border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300'
                                        : ''
                                    }
                                  >
                                    {data.prepayment.deductionStatus === 'DEDUCTED' 
                                      ? '차감됨'
                                      : data.prepayment.paymentStatus === 'REQUESTED' ? '청구됨' 
                                      : data.prepayment.paymentStatus === 'CONFIRMED' ? '입금확인'
                                      : data.prepayment.paymentStatus === 'AVAILABLE' ? '사용 가능'
                                      : data.prepayment.paymentStatus === 'REFUNDED' ? '환불됨'
                                      : data.prepayment.paymentStatus === 'CANCELLED' ? '취소됨'
                                      : data.prepayment.paymentStatus || '-'}
                                  </Badge>
                                } 
                              />
                              {data.prepayment.actualAmount != null && (
                                <InfoRow 
                                  label="실제 입금액" 
                                  value={`${formatNumber(data.prepayment.actualAmount, 0)}원`} 
                                />
                              )}
                              {data.prepayment.differenceAmount != null && data.prepayment.differenceAmount !== 0 && (
                                <InfoRow 
                                  label="차액" 
                                  value={
                                    <span className={data.prepayment.differenceAmount > 0 ? 'text-green-600' : 'text-red-600'}>
                                      {data.prepayment.differenceAmount > 0 ? '+' : ''}
                                      {formatNumber(data.prepayment.differenceAmount, 0)}원
                                    </span>
                                  } 
                                />
                              )}
                              <InfoRow label="청구일" value={formatDate(data.prepayment.requestedDate)} />
                              {data.prepayment.confirmedDate && (
                                <InfoRow label="입금확인일" value={formatDate(data.prepayment.confirmedDate)} />
                              )}
                              {data.prepayment.deductedDate && (
                                <InfoRow label="차감일" value={formatDate(data.prepayment.deductedDate)} />
                              )}
                              {data.prepayment.paymentMethod && (
                                <InfoRow label="입금 방법" value={data.prepayment.paymentMethod} />
                              )}
                            </div>
                            {data.prepayment.notes && (
                              <div className="pt-2 border-t">
                                <InfoRow label="비고" value={data.prepayment.notes} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border bg-muted/30 p-4">
                            <div className="text-sm text-muted-foreground">
                              {data.advancePaymentRatio != null || data.advancePaymentAmount != null ? (
                                <div className="space-y-2">
                                  {data.advancePaymentRatio != null && (
                                    <InfoRow label="선입금 비율" value={`${formatNumber(data.advancePaymentRatio, 2)}%`} />
                                  )}
                                  {data.advancePaymentAmount != null && (
                                    <InfoRow label="선입금 금액" value={`${formatNumber(data.advancePaymentAmount, 0)}원`} />
                                  )}
                                  <p className="text-xs text-muted-foreground mt-2">
                                    선입금이 아직 생성되지 않았습니다.
                                  </p>
                                </div>
                              ) : (
                                <p>선입금 정보가 없습니다.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </section>
                      <Separator />
                    </>
                  )}

                  {/* 요약 정보 */}
                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">요약</h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <InfoRow
                        label="총 금액"
                        value={totalAmount > 0 ? formatNumber(totalAmount, 2) : '-'}
                      />
                      {totalAdvancePayment > 0 && (
                        <InfoRow
                          label="총 선입금"
                          value={formatNumber(totalAdvancePayment, 2)}
                        />
                      )}
                    </div>
                  </section>

                  <Separator />

                  {/* 기록 */}
                  <section className="space-y-2.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">기록</h3>
                      <p className="text-xs text-muted-foreground">생성·수정일은 시스템 관리에 참고하세요.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <InfoRow
                        label="생성일"
                        value={data.createdAt ? new Date(data.createdAt).toLocaleString('ko-KR') : '-'}
                      />
                      <InfoRow
                        label="최종 수정일"
                        value={data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '-'}
                      />
                    </div>
                  </section>
                </>
              )}
          </div>
        </div>
  );

  const mainContent = asPanel ? (
    <div className="flex flex-col h-full min-w-0">
      <div className="border-b flex-shrink-0 px-4 py-3">{headerContent}</div>
      {bodyContent}
    </div>
  ) : (
    <Drawer open={open} onOpenChange={onOpenChange} direction={direction} dismissible={false}>
      <DrawerContent
        className={cn('h-full flex flex-col', noOverlay && 'z-[60]')}
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
        {!readOnly && (
        <DrawerFooter className="border-t border-border">
          <div className="flex justify-between gap-2">
            <DrawerClose asChild>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
            </DrawerClose>
            <div className="flex gap-2">
              {/* 판매 취소: 판매완료 시 기본 숨김. 운송이 배차대기·배차요청이면 되돌린 건으로 보고 표시 */}
              {data && showSalesCancelButton && (
                <Button
                  variant="destructive"
                  disabled={!data || updateSalesMutation.isPending || data.status === 'SALES_ITEM_CANCELLED'}
                  onClick={() => {
                    setCancelDialogOpen(true);
                  }}
                >
                  <XCircle className="mr-1.5 h-4 w-4" />
                  판매 취소
                </Button>
              )}
              {/* 판매 예약으로 변경: 현재 판매(SOLD) 상태일 때만 표시 */}
              {data && data.salesStatus === 'SOLD' && data.status !== 'SALES_ITEM_CANCELLED' && (
                <Button
                  variant="outline"
                  disabled={!data || updateSalesMutation.isPending || !data.productInfo?.length}
                  onClick={() => setReserveConfirmOpen(true)}
                >
                  <CalendarClock className="mr-1.5 h-4 w-4" />
                  판매 예약으로 변경
                </Button>
              )}
              {/* 판매 확정 버튼: 아직 확정/완료 전(salesStatus가 SOLD·COMPLETED가 아닐 때)이고 입고 확정이 있는 경우만 표시 */}
              {data && data.salesStatus !== 'SOLD' && data.salesStatus !== 'COMPLETED' && inboundStatusInfo.hasConfirmed && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="default"
                          disabled={!inboundStatusInfo.canConfirm || !data || updateSalesMutation.isPending}
                          onClick={() => {
                            if (data.id && inboundStatusInfo.canConfirm) {
                              setEditMode('confirm');
                              setConfirmDrawerOpen(true);
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          판매 확정
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {inboundStatusInfo.canConfirm
                        ? '모든 재고가 입고 확정되었습니다. 판매 확정이 가능합니다.'
                        : '일부 재고만 입고 확정되었습니다. 모든 재고가 입고 확정되면 판매 확정이 가능합니다.'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* 운송 보기: 판매 확정(SOLD) 이상이거나 배송이 있는 경우 표시 */}
              {data && (data.deliveryId || data.salesStatus === 'SOLD' || data.salesStatus === 'COMPLETED') && (
                <Button
                  variant="outline"
                  disabled={!data}
                  onClick={() => {
                    if (data?.id) {
                      router.push(`/sales/transport-management/transport?salesId=${data.id}${data.deliveryId ? `&id=${data.deliveryId}` : ''}`);
                      onOpenChange(false);
                    }
                  }}
                >
                  <Truck className="mr-1.5 h-4 w-4" />
                  운송 보기
                </Button>
              )}
              {/* 수정 버튼: 판매완료(COMPLETED) 포함 — 비고·하차지 등 사후 정리용. 취소 건·예약+전부 입고확정 전 예약 수정 분기는 기존과 동일 */}
              {data &&
                ((data.status === 'SALES_ITEM_RESERVED' && !inboundStatusInfo.canConfirm) ||
                  (data.status !== 'SALES_ITEM_RESERVED' && data.status !== 'SALES_ITEM_CANCELLED')) && (
                  <Button
                    variant="default"
                    disabled={!data || updateSalesMutation.isPending}
                    onClick={() => {
                      if (data && data.id) {
                        setEditMode('edit');
                        setEditDrawerOpen(true);
                      }
                    }}
                  >
                    <Edit className="mr-1.5 h-4 w-4" />
                    수정
                  </Button>
                )}
            </div>
          </div>
        </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );

  return (
    <>
      {mainContent}
      {!readOnly && (
        <>
        <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) {
            // 다이얼로그 닫을 때 상태 초기화
            setPrepaymentCancellationMethod(null);
            setCancellationReason('');
          } else {
            // 다이얼로그 열 때 선입금 상태에 따라 기본값 설정
            if (data?.prepayment?.paymentStatus === 'CONFIRMED') {
              setPrepaymentCancellationMethod('KEEP_FOR_NEXT'); // 기본값: 다음 거래에 사용
            }
          }
        }}>
          <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>판매 취소 확인</AlertDialogTitle>
              <AlertDialogDescription>
                정말로 이 판매를 취소하시겠습니까? 취소된 판매는 재고에 다시 반영됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-4">
              {/* 선입금 정보 표시 (예약이고 선입금이 있는 경우) */}
              {data?.reservationDate && data?.prepayment && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="text-sm font-semibold">선입금 정보</div>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">청구 금액:</span>
                      <span className="font-medium">
                        {data.prepayment.prepaymentAmount != null 
                          ? formatNumber(data.prepayment.prepaymentAmount, 0) 
                          : '-'}원
                      </span>
                    </div>
                    {data.prepayment.actualAmount != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">실제 입금액:</span>
                        <span className="font-medium">
                          {formatNumber(data.prepayment.actualAmount, 0)}원
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">상태:</span>
                      <Badge 
                        variant="outline"
                        className={
                          data.prepayment.paymentStatus === 'REQUESTED' 
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : data.prepayment.paymentStatus === 'CONFIRMED'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : data.prepayment.paymentStatus === 'AVAILABLE'
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : ''
                        }
                      >
                        {data.prepayment.paymentStatus === 'REQUESTED' ? '청구됨' 
                          : data.prepayment.paymentStatus === 'CONFIRMED' ? '입금확인'
                          : data.prepayment.paymentStatus === 'AVAILABLE' ? '사용 가능'
                          : data.prepayment.paymentStatus || '-'}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* CONFIRMED 상태일 때만 선택 UI 표시 */}
                  {data.prepayment.paymentStatus === 'CONFIRMED' && data.prepayment.deductionStatus !== 'DEDUCTED' && (
                    <div className="pt-3 border-t space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="prepaymentCancellationMethod">선입금 처리 방법</Label>
                        <Select
                          value={prepaymentCancellationMethod || 'KEEP_FOR_NEXT'}
                          onValueChange={(value) => setPrepaymentCancellationMethod(value as 'REFUND' | 'KEEP_FOR_NEXT')}
                        >
                          <SelectTrigger id="prepaymentCancellationMethod">
                            <SelectValue placeholder="선입금 처리 방법을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="REFUND">환불 처리</SelectItem>
                            <SelectItem value="KEEP_FOR_NEXT">다음 거래에 사용</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {prepaymentCancellationMethod === 'REFUND' 
                            ? '선입금을 취소하고 환불 처리합니다.'
                            : prepaymentCancellationMethod === 'KEEP_FOR_NEXT'
                            ? '선입금을 다음 거래에서 사용할 수 있도록 유지합니다.'
                            : '선입금 처리 방법을 선택하세요.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* 취소 사유 입력 */}
              <div className="space-y-2">
                <Label htmlFor="cancellationReason">취소 사유</Label>
                <Textarea
                  id="cancellationReason"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="취소 사유를 입력하세요"
                  rows={3}
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!data?.id || !data.productInfo) return;
                  
                  // 선입금이 CONFIRMED 상태인데 선택하지 않은 경우
                  if (data.prepayment?.paymentStatus === 'CONFIRMED' && !prepaymentCancellationMethod) {
                    toast({
                      title: '선입금 처리 방법 선택 필요',
                      description: '선입금 처리 방법을 선택해주세요.',
                      variant: 'destructive',
                    });
                    return;
                  }
                  
                  try {
                    // 모든 판매 항목의 상태를 SALES_ITEM_CANCELLED로 변경
                    const items = data.productInfo.map((product) => ({
                      id: product.itemId,
                      containerId: product.containerId || '',
                      containerType: product.containerType || 'CONTAINER',
                      cargoBales: product.cargoBales ?? null,
                      cargoWeight: product.cargoWeight ?? null,
                      stoCost: product.stoCost ?? null,
                      dtCost: product.dtCost ?? null,
                      advancePaymentRatio: product.advancePaymentRatio ?? null,
                      margin: product.margin ?? null,
                      salesUnitPrice: product.salesUnitPrice ?? null,
                      status: 'SALES_ITEM_CANCELLED', // 판매 취소 상태로 변경
                    }));

                    console.log('[판매 취소-프론트] 전송 데이터:', {
                      salesId: data.id,
                      itemsCount: items.length,
                      items: items.map((i) => ({ id: i.id, containerId: i.containerId, status: i.status })),
                      prepaymentCancellationMethod: data.prepayment?.paymentStatus === 'CONFIRMED' ? prepaymentCancellationMethod : null,
                      cancellationReason: cancellationReason ? '있음' : '없음',
                    });

                    await updateSalesMutation.mutateAsync({
                      id: data.id,
                      data: {
                        customerId: data.customerId, // 기존 고객 ID 유지
                        items,
                        isCancellation: true, // 취소 다이얼로그 호출 → items: []여도 전체 취소 처리
                        prepaymentCancellationMethod: data.prepayment?.paymentStatus === 'CONFIRMED'
                          ? prepaymentCancellationMethod
                          : null,
                        cancellationReason: cancellationReason || null,
                      },
                    });

                    toast({
                      title: '판매 취소 완료',
                      description: '판매가 취소되었습니다.',
                    });

                    setCancelDialogOpen(false);
                    setPrepaymentCancellationMethod(null);
                    setCancellationReason('');
                    refetch();
                  } catch (error: any) {
                    console.error('판매 취소 오류:', error);
                    toast({
                      title: '판매 취소 실패',
                      description: error?.response?.data?.message || '판매 취소 중 오류가 발생했습니다.',
                      variant: 'destructive',
                    });
                  }
                }}
                disabled={updateSalesMutation.isPending}
              >
                {updateSalesMutation.isPending ? '처리 중...' : '판매 취소'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 판매 예약으로 변경 확인 */}
        <AlertDialog open={reserveConfirmOpen} onOpenChange={setReserveConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>판매 예약으로 변경</AlertDialogTitle>
              <AlertDialogDescription>
                이 판매를 판매 예약 상태로 변경하시겠습니까? (판매 → 판매 예약)
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!data?.id || !data.productInfo) return;
                  try {
                    const items = data.productInfo
                      .filter((p) => p.status !== 'SALES_ITEM_CANCELLED')
                      .map((product) => ({
                        id: product.itemId,
                        containerId: product.containerId || '',
                        containerType: product.containerType || 'CONTAINER',
                        cargoBales: product.cargoBales ?? null,
                        cargoWeight: product.cargoWeight ?? null,
                        stoCost: product.stoCost ?? null,
                        dtCost: product.dtCost ?? null,
                        advancePaymentRatio: product.advancePaymentRatio ?? null,
                        margin: product.margin ?? null,
                        salesUnitPrice: product.salesUnitPrice ?? null,
                        salesUnitPriceStage: product.salesUnitPriceStage ?? null,
                        status: 'SALES_ITEM_RESERVED',
                      }));
                    await updateSalesMutation.mutateAsync({
                      id: data.id,
                      data: { customerId: data.customerId, items },
                    });
                    toast({
                      title: '판매 예약으로 변경 완료',
                      description: '판매가 판매 예약 상태로 변경되었습니다.',
                    });
                    setReserveConfirmOpen(false);
                    refetch();
                  } catch (error: any) {
                    toast({
                      title: '변경 실패',
                      description: error?.response?.data?.message || '판매 예약으로 변경 중 오류가 발생했습니다.',
                      variant: 'destructive',
                    });
                  }
                }}
                disabled={updateSalesMutation.isPending}
              >
                {updateSalesMutation.isPending ? '처리 중...' : '변경'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 중첩된 수정/확정 drawer */}
        {data?.id && (
          <SalesFormDrawer
            open={editDrawerOpen || confirmDrawerOpen}
            onOpenChange={(open) => {
              if (!open) {
                setEditDrawerOpen(false);
                setConfirmDrawerOpen(false);
              } else {
                if (editMode === 'edit') {
                  setEditDrawerOpen(true);
                } else {
                  setConfirmDrawerOpen(true);
                }
              }
            }}
            mode={editMode}
            salesId={data.id}
            onSubmit={async (formData: any) => {
              if (!data?.id) return;
              
              try {
                if (editMode === 'edit') {
                  // SalesFormData를 UpdateSalesDto로 변환
                  const payload: UpdateSalesDto = {
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
                    reservationDate: formData.reservationDate && formData.reservationDate.trim() ? formData.reservationDate.trim() : undefined,
                    salesDate: formData.salesDate && formData.salesDate.trim() ? formData.salesDate.trim() : undefined,
                    requestVehicle: formData.requestVehicle || null,
                    transportFee: formData.transportFee ?? null,
                    advancePaymentRatio: formData.advancePaymentRatio ?? null,
                    advancePaymentAmount: formData.advancePaymentAmount ?? null,
                    items: (formData.selectedContainers || []).map((container: any) => ({
                      id: container.itemId,
                      containerId: container.containerId || container.id || '',
                      containerType: container.containerType || 'CONTAINER',
                      cargoBales: container.cargoBales ?? null,
                      cargoWeight: container.cargoWeight ?? null,
                      stoCost: container.stoCost ?? null,
                      dtCost: container.dtCost ?? null,
                      advancePaymentRatio: container.advancePaymentRatio ?? null,
                      margin: container.margin ?? null,
                      salesUnitPrice: container.salesUnitPrice ?? null,
                      salesUnitPriceStage: container.salesUnitPriceStage ?? null,
                      status: container.status ?? null,
                    })),
                  };
                  await updateSalesMutation.mutateAsync({ id: data.id, data: payload });
                } else if (editMode === 'confirm') {
                  // SalesFormData를 UpdateSalesDto로 변환 (판매 확정)
                  const payload: UpdateSalesDto = {
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
                    reservationDate: formData.reservationDate && formData.reservationDate.trim() ? formData.reservationDate.trim() : (formData.reservationDate === '' ? null : undefined),
                    salesDate: formData.salesDate && formData.salesDate.trim() ? formData.salesDate.trim() : (formData.salesDate === '' ? null : undefined),
                    requestVehicle: formData.requestVehicle || null,
                    transportFee: formData.transportFee ?? null,
                    advancePaymentRatio: formData.advancePaymentRatio ?? null,
                    advancePaymentAmount: formData.advancePaymentAmount ?? null,
                    items: (formData.selectedContainers || []).map((container: any) => ({
                      id: container.itemId,
                      containerId: container.containerId || container.id || '',
                      containerType: container.containerType || 'CONTAINER',
                      cargoBales: container.cargoBales ?? null,
                      cargoWeight: container.cargoWeight ?? null,
                      stoCost: container.stoCost ?? null,
                      dtCost: container.dtCost ?? null,
                      advancePaymentRatio: container.advancePaymentRatio ?? null,
                      margin: container.margin ?? null,
                      salesUnitPrice: container.salesUnitPrice ?? null,
                      salesUnitPriceStage: container.salesUnitPriceStage ?? null,
                      status: container.status ?? null,
                    })),
                  };
                  await confirmSalesMutation.mutateAsync({ id: data.id, data: payload });
                }
                
                setEditDrawerOpen(false);
                setConfirmDrawerOpen(false);
                await refetch();
              } catch (error) {
                console.error('판매 저장 중 오류:', error);
                throw error;
              }
            }}
            isSubmitting={editMode === 'edit' ? updateSalesMutation.isPending : confirmSalesMutation.isPending}
          />
        )}
      </>
      )}
      <ReturnRegisterDialog
        open={returnDialogOpen}
        onOpenChange={setReturnDialogOpen}
        salesId={data?.id ?? null}
        itemOptions={returnRegisterItemOptions}
        warehouses={warehouses}
      />
    </>
  );
}

