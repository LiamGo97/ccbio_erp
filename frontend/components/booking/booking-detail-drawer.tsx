'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Edit, X, Trash2, FileText, FileCheck, ChevronUp, ChevronDown, DollarSign } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useTradeOrder, TradeOrder, formatOrderSequence } from '@/lib/hooks/use-trade-orders';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { DocumentsProcessingDrawer } from './documents-processing-drawer';
import { GoogleDriveFilePreview } from '@/components/google-drive/google-drive-file-preview';
import { useGoogleDriveFileMetadata } from '@/lib/hooks/use-google-drive';
import {
  PaymentProcessingDrawer,
  type PaymentProcessingTarget,
} from '@/components/trade-order/payment-processing-drawer';

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

interface BookingDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string | null;
  onEdit?: (order: TradeOrder) => void;
  onDelete?: (order: TradeOrder) => void;
  onScheduleInbound?: (order: TradeOrder) => void; // 입고예정 상태로 변경
  title?: string; // 커스텀 제목
  description?: string; // 커스텀 설명
  // 버튼 표시 제어
  showDocumentsButton?: boolean; // 서류 처리 버튼 표시 여부
  showScheduleInboundButton?: boolean; // 입고예정 버튼 표시 여부
}

export function BookingDetailDrawer({
  open,
  onOpenChange,
  bookingId,
  onEdit,
  onDelete,
  onScheduleInbound,
  title,
  description,
  showDocumentsButton = true, // 기본값: true (무역 관리 페이지에서 사용)
  showScheduleInboundButton = false, // 기본값: false (입고대기 페이지에서만 사용)
}: BookingDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data, isLoading, refetch } = useTradeOrder(bookingId ?? undefined);
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');
  const { data: tradeGradeCodes } = useCodesByCategory('TRADE_GRADE');
  const { data: salesGradeCodes } = useCodeMastersByGroup('SALES_GRADE');
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: currencyCodes } = useCodesByCategory('CURRENCY');
  const { data: exportCountryCodes } = useCodesByCategory('EXPORT_COUNTRY');
  const { data: exporterCodes } = useCodesByCategory('EXPORTER');
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const { data: paymentMethodCodes } = useCodesByCategory('PAYMENT_TERMS');
  
  const [documentsDrawerOpen, setDocumentsDrawerOpen] = React.useState(false);
  const [invoiceFilePreviewOpen, setInvoiceFilePreviewOpen] = React.useState(false);
  const [containersOpen, setContainersOpen] = React.useState(true);
  const [paymentProcessingDrawerOpen, setPaymentProcessingDrawerOpen] = React.useState(false);
  const [paymentProcessingTarget, setPaymentProcessingTarget] =
    React.useState<PaymentProcessingTarget>('payments');
  
  // 송장 파일 메타데이터 조회
  const invoiceFileId = data?.invoiceGoogleDriveFileId || null;
  const shouldFetchInvoiceMetadata = open && !!data?.invoiceGoogleDriveFileId;
  const { data: invoiceFileMetadata } = useGoogleDriveFileMetadata(
    invoiceFileId,
    shouldFetchInvoiceMetadata,
  );

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && bookingId) {
      refetch();
    }
  }, [open, bookingId, refetch]);

  // drawer가 닫힐 때 데이터 갱신 (상위 컴포넌트에서 refetch를 트리거할 수 있도록)
  React.useEffect(() => {
    if (!open && bookingId) {
      // drawer가 닫힌 후 약간의 지연을 두고 refetch (상위 컴포넌트에서 refetch 호출 가능)
      const timer = setTimeout(() => {
        refetch();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, bookingId, refetch]);

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
                      : category === 'PAYMENT_TERMS'
                        ? paymentMethodCodes
                        : [];
    return codes?.find((code) => code.value === value)?.name || value || '-';
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full"
        style={{ width: isMobile ? '100%' : '85%', maxWidth: '1200px' }}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>
                {title || (data?.tradeStatus === 'DOCUMENTS' 
                  ? '입고 대기 상세정보'
                  : '부킹 상세정보')}
              </DrawerTitle>
              <DrawerDescription>
                {description || (data?.tradeStatus === 'DOCUMENTS'
                  ? '입고 대기 정보를 확인하고 관리합니다.'
                  : '부킹 정보를 확인하고 관리합니다.')}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
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
                      <Label className="text-sm font-medium text-muted-foreground">커미션 $</Label>
                      <p className="text-sm">{data.commissionDollar || '-'}</p>
                    </div>
                  </div>
                  {/* 선적 조건 (계약 레벨 + 주문별 쿼터) */}
                  <div className="grid grid-cols-6 gap-4 pt-3 border-t border-border mt-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">쿼터 유무 (주문별)</Label>
                      <p className="text-sm">
                        {data.quota === 'Y' ? '예' : data.quota === 'N' ? '아니오' : '미설정 (계약 쿼터 사용)'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">훈증 유무</Label>
                      <p className="text-sm">{data.fumigation === 'Y' ? '예' : data.fumigation === 'N' ? '아니오' : '-'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">관세 유무</Label>
                      <p className="text-sm">{data.customsDuty === 'Y' ? '예' : data.customsDuty === 'N' ? '아니오' : '-'}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 부킹 정보 */}
              <div className={`space-y-3 ${data.contractNo || data.contractGoogleDriveFileId ? 'pt-6 pb-6 border-t border-border' : 'pb-6'}`}>
                <h3 className="text-sm font-semibold text-foreground">부킹 정보</h3>
                <div className="grid grid-cols-6 gap-4 pt-3">
                  <div className="space-y-2">
<Label className="text-sm font-medium text-muted-foreground">순번</Label>
                    <p className="text-sm">{formatOrderSequence(data.sequence, data.sequenceSub)}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">BK</Label>
                    <p className="text-sm">{data.bk || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">BL</Label>
                    <p className="text-sm">{data.bl || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">선사</Label>
                    <p className="text-sm">{data.shippingLineName || getCodeName('SHIPPING_LINE', data.shippingLineCode) || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">도착항</Label>
                    <p className="text-sm">{data.destinationName || getCodeName('DESTINATION_PORT', data.destinationCode) || '-'}</p>
                </div>
                </div>
                <div className="grid grid-cols-6 gap-4 pt-3 mt-3 border-t border-border">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">ETD</Label>
                    <p className="text-sm">{formatDate(data.etdDate) || data.etdText || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">ETA</Label>
                    <p className="text-sm">{formatDate(data.etaDate) || '-'}</p>
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
                          <div className="grid grid-cols-9 gap-4">
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
                              <p className="text-sm">
                                {(() => {
                                  const tradeGrade = getCodeName('TRADE_GRADE', container.tradeGrade) || container.tradeGrade || '';
                                  const salesGrade = container.salesGrade 
                                    ? (salesGradeCodes?.find(c => c.value === container.salesGrade)?.name || container.salesGrade)
                                    : '';
                                  if (tradeGrade && salesGrade) {
                                    return `${tradeGrade} / ${salesGrade}`;
                                  } else if (tradeGrade) {
                                    return tradeGrade;
                                  } else if (salesGrade) {
                                    return salesGrade;
                                  }
                                  return '-';
                                })()}
                              </p>
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
                              <Label className="text-sm font-medium text-muted-foreground">베일(무역)</Label>
                              <p className="text-sm">{container.tradeBales != null ? Number(container.tradeBales).toLocaleString('ko-KR') : '-'}</p>
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
            /* 부킹 상세정보 (기존) */
            <div className="space-y-0">
              {/* 계약 정보 - 항상 표시 */}
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
                      <Label className="text-sm font-medium text-muted-foreground">커미션 $</Label>
                      <p className="text-sm">{data.commissionDollar || '-'}</p>
                    </div>
                  </div>
                  {/* 선적 조건 (계약 레벨 + 주문별 쿼터) */}
                  <div className="grid grid-cols-6 gap-4 pt-3 border-t border-border mt-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">쿼터 유무 (주문별)</Label>
                      <p className="text-sm">
                        {data.quota === 'Y' ? '예' : data.quota === 'N' ? '아니오' : '미설정 (계약 쿼터 사용)'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">훈증 유무</Label>
                      <p className="text-sm">{data.fumigation === 'Y' ? '예' : data.fumigation === 'N' ? '아니오' : '-'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">관세 유무</Label>
                      <p className="text-sm">{data.customsDuty === 'Y' ? '예' : data.customsDuty === 'N' ? '아니오' : '-'}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 부킹 정보 - 1행: 순번, BK, BL, 선사, 도착항 / 2행: ETD, ETA 등 (입력 폼과 동일) */}
              <div className={`space-y-3 ${data.contractNo || data.contractGoogleDriveFileId ? 'pt-6 pb-6 border-t border-border' : 'pb-6'}`}>
                <h3 className="text-sm font-semibold text-foreground">부킹 정보</h3>
                <div className="grid grid-cols-6 gap-4 pt-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">순번</Label>
                    <p className="text-sm">{formatOrderSequence(data.sequence, data.sequenceSub)}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">BK</Label>
                    <p className="text-sm">{data.bk || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">BL</Label>
                    <p className="text-sm">{data.bl || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">선사</Label>
                    <p className="text-sm">{data.shippingLineName || getCodeName('SHIPPING_LINE', data.shippingLineCode) || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">도착항</Label>
                    <p className="text-sm">{data.destinationName || getCodeName('DESTINATION_PORT', data.destinationCode) || '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-4 pt-3 mt-3 border-t border-border">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">ETD (수기)</Label>
                    <p className="text-sm">{formatDate(data.etdDate) || data.etdText || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">ETD API (참조용)</Label>
                    <p className="text-sm">{formatDate(data.etdApi) || '-'}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">ETA</Label>
                    <p className="text-sm">{formatDate(data.etaDate) || '-'}</p>
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
                          <div className="grid grid-cols-9 gap-4">
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
                              <p className="text-sm">
                                {(() => {
                                  const tradeGrade = getCodeName('TRADE_GRADE', container.tradeGrade) || container.tradeGrade || '';
                                  const salesGrade = container.salesGrade 
                                    ? (salesGradeCodes?.find(c => c.value === container.salesGrade)?.name || container.salesGrade)
                                    : '';
                                  if (tradeGrade && salesGrade) {
                                    return `${tradeGrade} / ${salesGrade}`;
                                  } else if (tradeGrade) {
                                    return tradeGrade;
                                  } else if (salesGrade) {
                                    return salesGrade;
                                  }
                                  return '-';
                                })()}
                              </p>
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
                              <Label className="text-sm font-medium text-muted-foreground">베일(무역)</Label>
                              <p className="text-sm">{container.tradeBales != null ? Number(container.tradeBales).toLocaleString('ko-KR') : '-'}</p>
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
          )}
        </div>

        <div className="border-t border-border p-4">
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
            {/* 서류 처리 버튼: 무역 상태가 BOOKING이고 showDocumentsButton이 true일 때만 표시 */}
            {showDocumentsButton && 
             data?.tradeStatus === 'BOOKING' && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => setDocumentsDrawerOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <FileCheck className="mr-1.5 h-4 w-4" />
                서류 처리
              </Button>
            )}
            {/* 결제하기 버튼: 결제 대기 상세정보일 때만 표시 */}
            {title === '결제 대기 상세정보' && data?.payments && data.payments.length > 0 && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => {
                  setPaymentProcessingTarget('payments');
                  setPaymentProcessingDrawerOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <DollarSign className="mr-1.5 h-4 w-4" />
                {data.tradeStatus === 'BOOKING' &&
                data.bookingTempPayments &&
                data.bookingTempPayments.length > 0
                  ? '정식 결제 처리'
                  : '결제하기'}
              </Button>
            )}
            {title === '결제 대기 상세정보' &&
              data?.tradeStatus === 'BOOKING' &&
              data.bookingTempPayments &&
              data.bookingTempPayments.length > 0 && (
                <Button
                  variant="default"
                  disabled={!data}
                  onClick={() => {
                    setPaymentProcessingTarget('bookingTempPayments');
                    setPaymentProcessingDrawerOpen(true);
                  }}
                  className="border-amber-600/80 bg-amber-600 text-white hover:bg-amber-700"
                >
                  <DollarSign className="mr-1.5 h-4 w-4" />
                  임시(부킹) 결제 처리
                </Button>
              )}
            {/* 입고예정 버튼: showScheduleInboundButton이 true이고 영업 상태가 INBOUND_PENDING일 때만 표시 */}
            {showScheduleInboundButton && 
             data?.salesStatus === 'INBOUND_PENDING' && 
             onScheduleInbound && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => {
                  if (data && onScheduleInbound) {
                    onScheduleInbound(data);
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <FileCheck className="mr-1.5 h-4 w-4" />
                입고예정
              </Button>
            )}
            {onEdit && (
              <Button
                variant="default"
                disabled={!data}
                onClick={() => {
                  if (data && onEdit) {
                    onEdit(data);
                  }
                }}
              >
                <Edit className="mr-1.5 h-4 w-4" />
                수정
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>

      {/* 서류 처리 Drawer */}
      <DocumentsProcessingDrawer
        open={documentsDrawerOpen}
        onOpenChange={setDocumentsDrawerOpen}
        booking={data ?? null}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* 송장 파일 미리보기 */}
      <GoogleDriveFilePreview
        open={invoiceFilePreviewOpen}
        onOpenChange={setInvoiceFilePreviewOpen}
        file={invoiceFileMetadata ?? null}
      />

      {/* 결제 처리 Drawer */}
      <PaymentProcessingDrawer
        open={paymentProcessingDrawerOpen}
        onOpenChange={setPaymentProcessingDrawerOpen}
        orderId={bookingId as string | null}
        processingTarget={paymentProcessingTarget}
        onSuccess={() => {
          refetch();
        }}
      />
    </Drawer>
  );
}

