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
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Edit, X, Trash2, CheckCircle2, FileText, ChevronUp, ChevronDown, Save } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { useTradeOrder, TradeOrder, useUpdateTradeOrder, formatOrderSequence } from '@/lib/hooks/use-trade-orders';
import { toast } from '@/components/ui/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQueryClient } from '@tanstack/react-query';
import { ContractConfirmationDrawer } from './contract-confirmation-drawer';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { TradeContractDetailContent } from '../trade-contract/trade-contract-detail-content';
import { TradeOrderFormDrawer } from './trade-order-form-drawer';
import { MonthPicker } from '@/components/schedules/month-picker';

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

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatWeight = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }) + ' MT';
};

interface TradeOrderDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeOrderId?: string | null;
  onEdit?: (order: TradeOrder) => void;
  onDelete?: (order: TradeOrder) => void;
}

export function TradeOrderDetailDrawer({
  open,
  onOpenChange,
  tradeOrderId,
  onEdit,
  onDelete,
}: TradeOrderDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useTradeOrder(tradeOrderId ?? undefined);
  const queryClient = useQueryClient();
  const updateMutation = useUpdateTradeOrder();
  const [commissionDollar, setCommissionDollar] = React.useState('');
  const [commissionMonth, setCommissionMonth] = React.useState('');
  const [commissionSaving, setCommissionSaving] = React.useState(false);
  
  // tradeOrderId 변경 시 로그
  React.useEffect(() => {
    console.log('[발주 상세] tradeOrderId 변경:', tradeOrderId);
  }, [tradeOrderId]);
  
  // 데이터 로드 완료 시 로그
  React.useEffect(() => {
    if (data) {
      console.log('[발주 상세] 데이터 로드 완료:', {
        id: data.id,
        contractNo: data.contractNo,
        status: data.status,
        tradeStatus: data.tradeStatus,
      });
    }
  }, [data]);
  
  // 로딩 상태 변경 시 로그
  React.useEffect(() => {
    console.log('[발주 상세] 로딩 상태:', isLoading);
  }, [isLoading]);
  
  // 코드 마스터 (서류 처리 상태일 때 사용)
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: tradeGradeCodes } = useCodesByCategory('TRADE_GRADE');
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: currencyCodes } = useCodesByCategory('CURRENCY');
  const { data: exportCountryCodes } = useCodesByCategory('EXPORT_COUNTRY');
  const { data: exporterCodes } = useCodesByCategory('EXPORTER');
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');

  const [confirmContractDrawerOpen, setConfirmContractDrawerOpen] = React.useState(false);
  const [containersOpen, setContainersOpen] = React.useState(true);
  const [editDrawerOpen, setEditDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editDrawerOpen) {
        e.preventDefault();
        setEditDrawerOpen(false);
        return;
      }
      if (confirmContractDrawerOpen) {
        e.preventDefault();
        setConfirmContractDrawerOpen(false);
        return;
      }
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, editDrawerOpen, confirmContractDrawerOpen, onOpenChange]);
  
  const getCodeName = (category: string, value?: string | null) => {
    const codes =
      category === 'PRODUCT'
        ? productCodes
        : category === 'TRADE_GRADE'
          ? tradeGradeCodes
          : category === 'PACKING_TYPE'
            ? packingCodes
            : category === 'CURRENCY'
              ? currencyCodes
              : category === 'EXPORT_COUNTRY'
                ? exportCountryCodes
                : category === 'EXPORTER'
                  ? exporterCodes
                  : category === 'SHIPPING_LINE'
                    ? shippingLineCodes
                    : category === 'DESTINATION_PORT'
                      ? destinationCodes
                      : [];
    return codes?.find((code) => code.value === value)?.name || value || '-';
  };

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    console.log('[발주 상세] drawer 상태 변경:', {
      open,
      tradeOrderId,
      isLoading,
      hasData: !!data,
    });
    
    if (open && tradeOrderId) {
      console.log('[발주 상세] 데이터 갱신 시작 - tradeOrderId:', tradeOrderId);
      refetch();
    }
  }, [open, tradeOrderId, refetch, isLoading, data]);

  // 커미션 필드 로컬 상태를 서버 데이터와 동기화
  React.useEffect(() => {
    if (data) {
      setCommissionDollar(data.commissionDollar ?? '');
      setCommissionMonth(data.commissionMonth ?? '');
    }
  }, [data?.id, data?.commissionDollar, data?.commissionMonth]);

  const handleContractConfirmationSuccess = async () => {
    await refetch();
    onOpenChange(false);
  };

  // 텍스트 선택을 위한 핸들러
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    // 텍스트 선택 중일 때는 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 텍스트 선택이 이미 시작된 경우에만 드래그 방지
    // 더블클릭으로 텍스트 선택을 시작하는 경우는 허용
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  // 더블클릭으로 텍스트 선택을 허용하기 위한 핸들러
  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    // 더블클릭 시 텍스트 선택이 가능하도록 드래그 제스처 방지
    const target = e.target as HTMLElement;
    // 입력 요소나 버튼이 아닌 경우에만 텍스트 선택 허용
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    // 더블클릭으로 텍스트 선택을 시작할 수 있도록 드래그 제스처 방지
    e.stopPropagation();
  }, []);

  return (
    <>
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
                <DrawerTitle>
                  {data?.tradeStatus === 'DOCUMENTS' 
                    ? '서류 처리 상세정보'
                    : data?.contractStatus === 'CONTRACT' 
                      ? '계약 상세정보' 
                      : '발주 상세정보'}
                </DrawerTitle>
                <DrawerDescription>
                  {data?.tradeStatus === 'DOCUMENTS'
                    ? '서류 처리 정보를 확인하고 관리합니다.'
                    : data?.contractStatus === 'CONTRACT' 
                      ? '계약 정보를 확인하고 관리합니다.'
                      : '발주 정보를 확인하고 관리합니다.'}
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

          <div 
            className="flex-1 overflow-y-auto p-4"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            onDoubleClick={handleDoubleClick}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !data ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                데이터를 불러올 수 없습니다.
              </div>
            ) : data.tradeStatus === 'DOCUMENTS' ? (
              /* 서류 처리 상세정보 */
              <div className="space-y-0">
                {/* 계약 정보 */}
                {data.contractNo || data.contractGoogleDriveFileId ? (
                  <div className="space-y-3 pb-6">
                    <h3 className="text-sm font-semibold text-foreground">계약 정보</h3>
                    <div className="grid grid-cols-6 gap-4 pt-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">계약번호</Label>
                        <div className="flex items-center gap-2">
                          <p className="text-sm">{data.contractNo || '-'}</p>
                          {data.contractGoogleDriveFileId && (
                            <a
                              href={`https://drive.google.com/file/d/${data.contractGoogleDriveFileId}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 transition-colors"
                              title={data.contractFileName || '계약서 보기'}
                            >
                              <FileText className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">발주일</Label>
                        <p className="text-sm">{formatDate(data.orderDate)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">수출국</Label>
                        <p className="text-sm">{data.exportCountryName || getCodeName('EXPORT_COUNTRY', data.exportCountryCode) || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">수출사</Label>
                        <p className="text-sm">{data.exporterName || getCodeName('EXPORTER', data.exporterCode) || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">선사</Label>
                        <p className="text-sm">{data.shippingLineName || getCodeName('SHIPPING_LINE', data.shippingLineCode) || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">커미션 $</Label>
                        <Input
                          size="sm"
                          value={commissionDollar}
                          onChange={(e) => setCommissionDollar(e.target.value)}
                          placeholder="-"
                          className="max-w-[140px]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">커미션 월</Label>
                        <MonthPicker
                          value={commissionMonth || undefined}
                          onChange={(v) => setCommissionMonth(v ?? '')}
                          placeholder="년/월 선택"
                        />
                      </div>
                      <div className="space-y-2 flex flex-col justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="self-start"
                          disabled={commissionSaving}
                          onClick={async () => {
                            if (!data?.id) return;
                            setCommissionSaving(true);
                            try {
                              await updateMutation.mutateAsync({
                                id: data.id,
                                data: {
                                  commissionDollar: commissionDollar?.trim() || null,
                                  commissionMonth: commissionMonth?.trim() || null,
                                },
                              });
                              toast({ title: '저장됨', description: '커미션 정보가 저장되었습니다.' });
                              await refetch();
                            } catch (err) {
                              toast({
                                title: '저장 실패',
                                description: err instanceof Error ? err.message : '커미션 저장에 실패했습니다.',
                                variant: 'destructive',
                              });
                            } finally {
                              setCommissionSaving(false);
                            }
                          }}
                        >
                          {commissionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          <span className="ml-1">커미션 저장</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* 부킹 정보 */}
                <div className={`space-y-3 ${data.contractNo || data.contractGoogleDriveFileId ? 'pt-6 pb-6 border-t border-border' : 'pb-6'}`}>
                  <h3 className="text-sm font-semibold text-foreground">부킹 정보</h3>
                  <div className="grid grid-cols-6 gap-4 pt-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">BK</Label>
                      <p className="text-sm">{data.bk || '-'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">BL</Label>
                      <p className="text-sm">{data.bl || '-'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">순번</Label>
                      <p className="text-sm">{formatOrderSequence(data.sequence, data.sequenceSub)}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">ETD</Label>
                      <p className="text-sm">{formatDate(data.etdDate) || data.etdText || '-'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">ETA</Label>
                      <p className="text-sm">{formatDate(data.etaDate) || '-'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">도착항</Label>
                      <p className="text-sm">{data.destinationName || getCodeName('DESTINATION_PORT', data.destinationCode) || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* 컨테이너 정보 */}
                {data.containers && data.containers.length > 0 ? (
                  <Collapsible open={containersOpen} onOpenChange={setContainersOpen} className="pt-6 pb-6 border-t border-border">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <h3 className="text-sm font-semibold text-foreground">컨테이너 정보</h3>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">
                            컨테이너 수: <span className="font-semibold text-foreground">{data.containers.length}개</span>
                          </span>
                          <span className="text-muted-foreground">
                            베일(영업) 합계: <span className="font-semibold text-foreground">
                              {data.containers.reduce((sum, container) => {
                                const effective = container.salesBales ?? container.tradeBales;
                                return sum + (effective != null ? Number(effective) : 0);
                              }, 0).toLocaleString('ko-KR')}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            중량 합계: <span className="font-semibold text-foreground">
                              {formatWeight(
                                data.containers.reduce((sum, container) => {
                                  return sum + (container.weight != null ? Number(container.weight) : 0);
                                }, 0)
                              )}
                            </span>
                          </span>
                        </div>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          {containersOpen ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          <span className="sr-only">컨테이너 정보 {containersOpen ? '접기' : '펼치기'}</span>
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="space-y-4 mt-4">
                        {data.containers.map((container, index) => (
                          <div key={index} className="border border-border rounded-md p-4">
                            <div className="grid grid-cols-8 gap-4">
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">컨테이너 번호</Label>
                                <p className="text-sm font-medium">{container.containerNo || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">상품</Label>
                                <p className="text-sm">{getCodeName('PRODUCT', container.product) || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">등급</Label>
                                <p className="text-sm">{getCodeName('TRADE_GRADE', container.tradeGrade) || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">패킹 타입</Label>
                                <p className="text-sm">{getCodeName('PACKING_TYPE', container.packingType) || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">통화단위</Label>
                                <p className="text-sm">{getCodeName('CURRENCY', container.currency) || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">단가</Label>
                                <p className="text-sm">{formatNumber(container.unitPrice) || '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">베일(영업)</Label>
                                <p className="text-sm">{(container.salesBales ?? container.tradeBales) != null ? Number(container.salesBales ?? container.tradeBales).toLocaleString('ko-KR') : '-'}</p>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-muted-foreground">중량</Label>
                                <p className="text-sm">{formatWeight(container.weight)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <div className="space-y-3 pt-6 pb-6 border-t border-border">
                    <h3 className="text-sm font-semibold text-foreground">컨테이너 정보</h3>
                    <p className="text-sm text-muted-foreground">컨테이너 정보가 없습니다.</p>
                  </div>
                )}

                {/* 송장 정보 */}
                <div className="space-y-3 pt-6 pb-6 border-t border-border">
                  <h3 className="text-sm font-semibold text-foreground">송장 정보</h3>
                  <div className="grid grid-cols-6 gap-4 pt-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">송장 금액</Label>
                      <p className="text-sm">
                        {data.invoiceAmount != null ? formatNumber(data.invoiceAmount) : '-'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">송장 중량</Label>
                      <p className="text-sm">{formatWeight(data.invoiceWeight)}</p>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label className="text-sm font-medium text-muted-foreground">송장 파일</Label>
                      {data.invoiceGoogleDriveFileId ? (
                        <div className="mt-1">
                          <a
                            href={`https://drive.google.com/file/d/${data.invoiceGoogleDriveFileId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            {data.invoiceFileName || '송장 파일'}
                          </a>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 결제 정보 */}
                {data.payments && data.payments.length > 0 && (
                  <div className="space-y-3 pt-6 pb-6 border-t border-border">
                    <h3 className="text-sm font-semibold text-foreground">결제 정보</h3>
                    <div className="space-y-4">
                      {data.payments.map((payment, index) => (
                        <div key={payment.id || index} className="rounded-md border border-border bg-muted/10 p-4">
                          <div className="text-sm font-semibold text-foreground mb-3">
                            {payment.sequence}차 결제
                          </div>
                          <div className="grid grid-cols-6 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">결제 예정일</Label>
                              <p className="text-sm">{formatDate(payment.dueDate) || '-'}</p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">비율 (%)</Label>
                              <p className="text-sm">
                                {payment.ratio != null ? `${Number(payment.ratio).toFixed(2)}%` : '-'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">금액</Label>
                              <p className="text-sm">
                                {payment.amount != null ? formatNumber(payment.amount) : '-'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">결제 방법</Label>
                              <p className="text-sm">
                                {payment.method ? getCodeName('PAYMENT_TERMS', payment.method) || payment.method : '-'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">환율</Label>
                              <p className="text-sm">
                                {payment.exchangeRate != null ? Number(payment.exchangeRate).toFixed(6) : '-'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">결과</Label>
                              <p className="text-sm">{payment.result || '-'}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 비고 */}
                {data.notes && (
                  <div className="space-y-3 pt-6 pb-6 border-t border-border">
                    <h3 className="text-sm font-semibold text-foreground">비고</h3>
                    <div className="space-y-2">
                      <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
                    </div>
                  </div>
                )}

                {/* 기록 */}
                <div className="space-y-3 pt-6 pb-6 border-t border-border">
                  <h3 className="text-sm font-semibold text-foreground">기록</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">생성일</Label>
                      <p className="mt-1 text-sm">
                        {data.createdAt ? new Date(data.createdAt).toLocaleString('ko-KR') : '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">최종 수정일</Label>
                      <p className="mt-1 text-sm">
                        {data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 발주 상세정보 (등록 화면과 동일한 구조: 발주 기본 정보, 상품/가격, 선적 조건, 비고, 계약 정보) */
              <TradeContractDetailContent
                data={data}
                showTotalOrderCount={true}
                showContractInfo="conditional"
                showContractStatusManagement={false}
              />
            )}
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex justify-between items-center">
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
              <div className="flex justify-end gap-2">
                {onDelete && (
                  <Button
                    variant="destructive"
                    disabled={!data}
                    onClick={() => {
                      if (data && onDelete) {
                        onDelete(data);
                      }
                    }}
                    className="bg-destructive hover:bg-destructive/90 text-white"
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    삭제
                  </Button>
                )}
                {data?.contractStatus === 'ORDER' && (
                  <Button
                    variant="default"
                    disabled={!data}
                    onClick={() => setConfirmContractDrawerOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    계약 확정
                  </Button>
                )}
                {onEdit && (
                  <Button
                    variant="default"
                    disabled={!data}
                    onClick={() => {
                      if (data) {
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
        </DrawerContent>
      </Drawer>

      {/* 계약 확정 Drawer */}
      <ContractConfirmationDrawer
        open={confirmContractDrawerOpen}
        onOpenChange={setConfirmContractDrawerOpen}
        tradeOrder={data ?? null}
        onSuccess={handleContractConfirmationSuccess}
      />

      {/* 수정 Drawer - 중첩으로 열림 */}
      {data && (
        <TradeOrderFormDrawer
          open={editDrawerOpen}
          onOpenChange={(open) => {
            setEditDrawerOpen(open);
            if (!open) {
              // 수정 drawer가 닫힐 때 상세 drawer는 유지하고 데이터만 갱신
              refetch();
            }
          }}
          mode="edit"
          tradeOrder={data}
          onSubmit={async () => {
            setEditDrawerOpen(false);
            await refetch();
            // 페이지의 데이터도 갱신하기 위해 queryClient 사용
            await queryClient.invalidateQueries({ queryKey: ['trade-contracts'] });
            await queryClient.invalidateQueries({ queryKey: ['trade-orders'] });
          }}
          onCancel={() => {
            setEditDrawerOpen(false);
          }}
        />
      )}
    </>
  );
}

