'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ChevronUp, ChevronDown, Edit } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TradeOrder } from '@/lib/hooks/use-trade-orders';
import { formatOrderSequence } from '@/lib/hooks/use-trade-orders';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';
import { ContractInfoSection } from './contract-info-section';

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

// 날짜 형식인지 확인하는 헬퍼 함수
const isDateString = (value?: string | null) => {
  if (!value || value.trim() === '') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
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

interface TradeOrderDetailContentProps {
  data: TradeOrder;
  showDocumentsInfo?: boolean; // 서류 처리 정보 표시 여부 (송장, 결제 정보)
  gradeDisplayMode?: 'trade' | 'sales' | 'both'; // 등급 표시 모드: 무역 등급만, 영업 등급만, 둘 다
  onEditSalesGrade?: (orderId: string) => void; // 등급 수정 버튼 클릭 핸들러
  /** 입고 대기/예정/확정이 아닌 메뉴에서는 false로 숨김: 등급(영업), 베일(영업), 예정원가, 확정원가, STO/DT 비용 */
  showCostAndSalesColumns?: boolean;
  /** 로지스틱스 관리 > 서류 처리 상세에서만 true: 컨테이너 테이블에 쉽백 컬럼 표시 (UI 전용) */
  showShipBackColumn?: boolean;
  containerShipBackMap?: Record<string, boolean>;
  onContainerShipBackChange?: (key: string, checked: boolean) => void;
  /** 컨테이너 첫 컬럼: 'no' = 표시용 1,2,3... / 'sequence' = 실제 순번(입고 대기/예정/확정에서 사용) */
  containerNumberColumn?: 'no' | 'sequence';
}

export function TradeOrderDetailContent({
  data,
  showDocumentsInfo = false,
  gradeDisplayMode = 'both', // 기본값: 둘 다 표시
  onEditSalesGrade,
  showCostAndSalesColumns = true, // 입고 대기/예정/확정에서는 true, 그 외 메뉴에서는 false
  showShipBackColumn = false,
  containerShipBackMap,
  onContainerShipBackChange,
  containerNumberColumn = 'no',
}: TradeOrderDetailContentProps) {
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
  const { data: paymentResultCodes = [] } = useCodeMastersByGroup('PAYMENT_RESULT');

  const [containersOpen, setContainersOpen] = React.useState(true);

  const isBookingStage = data.tradeStatus === 'BOOKING';

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
                        : category === 'PAYMENT_RESULT'
                          ? paymentResultCodes
                          : [];
    return codes?.find((code) => code.value === value)?.name || value || '-';
  };

  return (
    <div className="space-y-0">
      {/* 계약 정보 */}
      <ContractInfoSection data={data} className="pb-6" />

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
        <div className="grid grid-cols-6 gap-4 pt-3 mt-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              {showDocumentsInfo ? 'ETD' : 'ETD (수기)'}
            </Label>
            <p className="text-sm">{formatDate(data.etdDate) || data.etdText || '-'}</p>
          </div>
          {!showDocumentsInfo && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">ETD API (참조용)</Label>
              <p className="text-sm">{formatDate(data.etdApi) || '-'}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">ETA</Label>
            <p className="text-sm">{formatDate(data.etaDate) || '-'}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">현물 유무</Label>
            <p className="text-sm">{data.spot === 'Y' ? '예' : data.spot === 'N' ? '아니오' : '-'}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">쿼터 유무 (주문별)</Label>
            <p className="text-sm">
              {data.quota === 'Y' ? '예' : data.quota === 'N' ? '아니오' : '미설정 (계약 쿼터 사용)'}
            </p>
          </div>
        </div>
      </div>

      {/* 부킹 단계 상세: 임시 중량·임시 송장금액만 표시 (입력은 부킹 수정 화면) */}
      {isBookingStage && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">임시 정보 (부킹)</h3>
          <p className="text-xs text-muted-foreground">부킹 수정 화면에서 저장한 값입니다.</p>
          <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">임시 중량 (MT)</Label>
              <p className="text-sm font-mono tabular-nums">
                {data.bookingTempWeightMt != null && !Number.isNaN(Number(data.bookingTempWeightMt))
                  ? formatWeight(data.bookingTempWeightMt)
                  : '-'}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">임시 송장금액</Label>
              <p className="text-sm font-mono tabular-nums">
                {data.bookingTempInvoiceAmount != null && !Number.isNaN(Number(data.bookingTempInvoiceAmount))
                  ? formatNumber(data.bookingTempInvoiceAmount)
                  : '-'}
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-4">
            <h4 className="text-sm font-semibold text-foreground">임시 결제 정보</h4>
            {data.bookingTempPayments && data.bookingTempPayments.length > 0 ? (
              <div className="space-y-4">
                {data.bookingTempPayments
                  .slice()
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((payment, index) => {
                    const tempInvoiceCurrency =
                      data.invoiceCurrencyName ||
                      data.invoiceCurrency ||
                      data.currencyName ||
                      data.currencyCode ||
                      '';
                    return (
                      <div
                        key={payment.id ?? `${payment.sequence}-${index}`}
                        className="rounded-md border border-border bg-muted/10 p-4"
                      >
                        <div className="mb-3 text-sm font-semibold text-foreground">
                          {payment.sequence}차 결제 (임시)
                        </div>
                        <div className="overflow-x-auto pb-1">
                          <div className="grid min-w-[56rem] grid-cols-7 gap-4">
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
                              <Label className="text-sm font-medium text-muted-foreground">송장 금액</Label>
                              <p className="text-sm">
                                {payment.amount != null
                                  ? `${tempInvoiceCurrency ? `${tempInvoiceCurrency} ` : ''}${formatNumber(payment.amount)}`
                                  : '-'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">결제 방법</Label>
                              <p className="text-sm">
                                {payment.method
                                  ? getCodeName('PAYMENT_TERMS', payment.method) || payment.method
                                  : '-'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">환율</Label>
                              <p className="text-sm">
                                {payment.exchangeRate != null
                                  ? parseFloat(Number(payment.exchangeRate).toFixed(6)).toString()
                                  : '-'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">결제 금액 (원화)</Label>
                              <p className="text-sm">
                                {payment.krwAmount != null ? `${formatNumber(payment.krwAmount)}원` : '-'}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-muted-foreground">결과</Label>
                              {payment.result ? (
                                <Badge variant={payment.result === 'COMPLETED' ? 'default' : 'secondary'}>
                                  {getCodeName('PAYMENT_RESULT', payment.result)}
                                </Badge>
                              ) : (
                                <p className="text-sm">-</p>
                              )}
                            </div>
                          </div>
                        </div>
                        {payment.notes && String(payment.notes).trim() !== '' && (
                          <div className="mt-3 space-y-2 border-t border-border pt-3">
                            <Label className="text-sm font-medium text-muted-foreground">비고</Label>
                            <p className="text-sm whitespace-pre-wrap">{payment.notes}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">저장된 임시 결제가 없습니다.</p>
            )}
          </div>
        </div>
      )}

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
                {showCostAndSalesColumns && (
                  <span className="text-muted-foreground">
                    베일(영업) 합계: <span className="font-semibold text-foreground">
                      {data.containers.reduce((sum, container) => {
                        const effective = container.salesBales ?? container.tradeBales;
                        return sum + (effective != null ? Number(effective) : 0);
                      }, 0).toLocaleString('ko-KR')}
                    </span>
                  </span>
                )}
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
            <div className="flex items-center gap-2">
              {showCostAndSalesColumns && onEditSalesGrade && data.id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (data.id && onEditSalesGrade) {
                      onEditSalesGrade(data.id);
                    }
                  }}
                >
                  <Edit className="mr-1.5 h-4 w-4" />
                  등급 수정
                </Button>
              )}
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
          </div>
          <CollapsibleContent>
            <div className="mt-4">
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className={containerNumberColumn === 'sequence' ? 'min-w-[40px] font-semibold text-foreground' : 'min-w-[28px] font-semibold text-foreground w-8'}>
                        {containerNumberColumn === 'sequence' ? '순번' : 'No'}
                      </TableHead>
                      <TableHead className="min-w-[140px] font-semibold text-foreground">컨테이너 번호</TableHead>
                      <TableHead className="min-w-[120px] font-semibold text-foreground">상품</TableHead>
                      {showCostAndSalesColumns && gradeDisplayMode === 'both' ? (
                        <>
                          <TableHead className="min-w-[100px] font-semibold text-foreground">등급(무역)</TableHead>
                          <TableHead className="min-w-[100px] font-semibold text-foreground">등급(영업)</TableHead>
                        </>
                      ) : !showCostAndSalesColumns ? (
                        <TableHead className="min-w-[100px] font-semibold text-foreground">등급(무역)</TableHead>
                      ) : (
                        <TableHead className="min-w-[100px] font-semibold text-foreground">
                          {gradeDisplayMode === 'trade' ? '등급(무역)' : '등급(영업)'}
                        </TableHead>
                      )}
                      <TableHead className="min-w-[80px] font-semibold text-foreground">패킹 타입</TableHead>
                      <TableHead className="min-w-[80px] font-semibold text-foreground">통화단위</TableHead>
                      <TableHead className="min-w-[120px] font-semibold text-foreground text-right">단가</TableHead>
                      <TableHead className="min-w-[90px] font-semibold text-foreground text-right">베일(무역)</TableHead>
                      {showCostAndSalesColumns && (
                        <TableHead className="min-w-[90px] font-semibold text-foreground text-right">베일(영업)</TableHead>
                      )}
                      <TableHead className="min-w-[120px] font-semibold text-foreground text-right">중량</TableHead>
                      {showCostAndSalesColumns && (
                        <>
                          <TableHead className="min-w-[140px] font-semibold text-foreground text-right">예정원가</TableHead>
                          <TableHead className="min-w-[140px] font-semibold text-foreground text-right">확정원가</TableHead>
                          <TableHead className="min-w-[100px] font-semibold text-foreground text-right">STO 비용</TableHead>
                          <TableHead className="min-w-[100px] font-semibold text-foreground text-right">DT 비용</TableHead>
                        </>
                      )}
                      {showShipBackColumn && (
                        <TableHead className="min-w-[80px] font-semibold text-foreground text-center">쉽백</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.containers
                      .slice()
                      .sort((a, b) => {
                        const seqA = (a as any).sequence ?? 9999;
                        const seqB = (b as any).sequence ?? 9999;
                        return seqA - seqB;
                      })
                      .map((container, index) => (
                      <TableRow key={index} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-center">
                          {containerNumberColumn === 'sequence'
                            ? ((container as any).sequence ?? '-')
                            : index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{container.containerNo || '-'}</TableCell>
                        <TableCell>{getCodeName('PRODUCT', container.product) || '-'}</TableCell>
                        {showCostAndSalesColumns && gradeDisplayMode === 'both' ? (
                          <>
                            <TableCell>
                              {getCodeName('TRADE_GRADE', container.tradeGrade) || container.tradeGrade || '-'}
                            </TableCell>
                            <TableCell>
                              {container.salesGrade 
                                ? (salesGradeCodes?.find(c => c.value === container.salesGrade)?.name || container.salesGrade)
                                : '-'}
                            </TableCell>
                          </>
                        ) : !showCostAndSalesColumns ? (
                          <TableCell>
                            {getCodeName('TRADE_GRADE', container.tradeGrade) || container.tradeGrade || '-'}
                          </TableCell>
                        ) : (
                          <TableCell>
                            {gradeDisplayMode === 'trade' 
                              ? (getCodeName('TRADE_GRADE', container.tradeGrade) || container.tradeGrade || '-')
                              : (container.salesGrade 
                                  ? (salesGradeCodes?.find(c => c.value === container.salesGrade)?.name || container.salesGrade)
                                  : '-')}
                          </TableCell>
                        )}
                        <TableCell>{getCodeName('PACKING_TYPE', container.packingType) || '-'}</TableCell>
                        <TableCell>{getCodeName('CURRENCY', container.currency) || '-'}</TableCell>
                        <TableCell className="text-right">{formatNumber(container.unitPrice) || '-'}</TableCell>
                        <TableCell className="text-right">
                          {container.tradeBales != null ? Number(container.tradeBales).toLocaleString('ko-KR') : '-'}
                        </TableCell>
                        {showCostAndSalesColumns && (
                          <TableCell className="text-right">
                            {(container.salesBales ?? container.tradeBales) != null
                              ? Number(container.salesBales ?? container.tradeBales).toLocaleString('ko-KR')
                              : '-'}
                          </TableCell>
                        )}
                        <TableCell className="text-right">{formatWeight(container.weight)}</TableCell>
                        {showCostAndSalesColumns && (
                          <>
                            <TableCell className="font-semibold text-right">
                              {container.pendingPurchaseCost 
                                ? Number(container.pendingPurchaseCost).toLocaleString('ko-KR', { 
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2 
                                  })
                                : '-'}
                            </TableCell>
                            <TableCell className="font-semibold text-right">
                              {container.confirmedPurchaseCost 
                                ? Number(container.confirmedPurchaseCost).toLocaleString('ko-KR', { 
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2 
                                  })
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {container.stoCost != null && container.stoCost !== '' 
                                ? Number(container.stoCost).toLocaleString('ko-KR', { 
                                    maximumFractionDigits: 2 
                                  })
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {container.dtCost != null && container.dtCost !== '' 
                                ? Number(container.dtCost).toLocaleString('ko-KR', { 
                                    maximumFractionDigits: 2 
                                  })
                                : '-'}
                            </TableCell>
                          </>
                        )}
                        {showShipBackColumn && (
                          <TableCell className="text-center">
                            <Switch
                              size="sm"
                              checked={containerShipBackMap?.[String(container.id ?? container.containerNo ?? index)] ?? (container as { shipBack?: boolean }).shipBack ?? false}
                              onCheckedChange={(checked) => {
                                const key = String(container.id ?? container.containerNo ?? index);
                                onContainerShipBackChange?.(key, checked);
                              }}
                              disabled={!onContainerShipBackChange}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">컨테이너 정보</h3>
          <p className="text-sm text-muted-foreground">컨테이너 정보가 없습니다.</p>
        </div>
      )}

      {/* 송장 정보 (서류 처리일 때만) */}
      {showDocumentsInfo && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">송장 정보</h3>
          <div className="grid grid-cols-6 gap-4 pt-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">송장 입력 날짜</Label>
              <p className="text-sm">
                {data.invoiceDate ? formatDate(data.invoiceDate) : '-'}
              </p>
            </div>
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
            <div className="space-y-2 col-span-3">
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
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">필증번호</Label>
              <p className="text-sm">
                {data.certificateNumber && data.certificateNumber.trim() !== '' ? data.certificateNumber : '-'}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">원본발송</Label>
              <p className="text-sm">
                {data.hasOriginalShipment === 'Y' 
                  ? (data.originalShipment 
                      ? data.originalShipment  // 텍스트 그대로 표시 (날짜 변환하지 않음)
                      : '발송 예정')
                  : '해당없음'}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">통관예정일</Label>
              <p className="text-sm">{formatDate(data.customsScheduledDate) || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* DO 정보 (DO 상태이거나 통관 상태일 때 표시, 통관예정일은 서류처리 섹션에 표시) */}
      {(data.tradeStatus === 'DO' || data.tradeStatus === 'CUSTOMS') && (data.doGoogleDriveFileId || data.quarantineDate) && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">DO 정보</h3>
          <div className="grid grid-cols-6 gap-4 pt-3">
            <div className="space-y-2 col-span-3">
              <Label className="text-sm font-medium text-muted-foreground">DO 문서</Label>
              {data.doGoogleDriveFileId ? (
                <div className="mt-1">
                  <a
                    href={`https://drive.google.com/file/d/${data.doGoogleDriveFileId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {data.doFileName || 'DO 파일'}
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">-</p>
              )}
            </div>
            <div className="space-y-2 col-span-1">
              <Label className="text-sm font-medium text-muted-foreground">검역일</Label>
              <p className="text-sm">{formatDate(data.quarantineDate) || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* 통관 정보 (통관 상태일 때만) */}
      {data.tradeStatus === 'CUSTOMS' && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">통관 정보</h3>
          <div className="grid grid-cols-6 gap-4 pt-3">
            <div className="space-y-2 col-span-3">
              <Label className="text-sm font-medium text-muted-foreground">면장 파일</Label>
              {!data.customsCertificateGoogleDriveFileId && !data.customsCertificateGoogleDriveFileId2 ? (
                <p className="text-sm text-muted-foreground">-</p>
              ) : (
                <div className="mt-1 space-y-2">
                  {data.customsCertificateGoogleDriveFileId ? (
                    <a
                      href={`https://drive.google.com/file/d/${data.customsCertificateGoogleDriveFileId}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-primary hover:underline"
                    >
                      {data.customsCertificateFileName || '면장 파일'}
                    </a>
                  ) : null}
                  {data.customsCertificateGoogleDriveFileId2 ? (
                    <a
                      href={`https://drive.google.com/file/d/${data.customsCertificateGoogleDriveFileId2}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-primary hover:underline"
                    >
                      {data.customsCertificateFileName2 || '면장 파일 (추가)'}
                    </a>
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-2 col-span-1">
              <Label className="text-sm font-medium text-muted-foreground">통관일</Label>
              <p className="text-sm">{formatDate(data.customsDate) || '-'}</p>
            </div>
          </div>
        </div>
      )}

      {/* 결제 정보 (서류 처리일 때만) */}
      {showDocumentsInfo && data.payments && data.payments.length > 0 && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">결제 정보</h3>
          <div className="space-y-4">
            {/* 일반 결제 항목 (DO 비용, 통관 비용이 아닌 것들) */}
            {data.payments
              .filter((payment) => payment.paymentType !== 'DO_COST' && payment.paymentType !== 'CUSTOMS_COST')
              .map((payment, index) => (
                <div key={payment.id || index} className="rounded-md border border-border bg-muted/10 p-4">
                  <div className="text-sm font-semibold text-foreground mb-3">
                    {payment.sequence}차 결제
                  </div>
                  <div className="grid grid-cols-7 gap-4">
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
                      <Label className="text-sm font-medium text-muted-foreground">송장 금액</Label>
                      <p className="text-sm">
                        {payment.amount != null 
                          ? `${data.invoiceCurrencyName || data.invoiceCurrency || data.currencyName || ''} ${formatNumber(payment.amount)}`
                          : '-'}
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
                        {payment.exchangeRate != null 
                          ? parseFloat(Number(payment.exchangeRate).toFixed(6)).toString()
                          : '-'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">결제 금액 (원화)</Label>
                      <p className="text-sm">
                        {payment.krwAmount != null ? `${formatNumber(payment.krwAmount)}원` : '-'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">결과</Label>
                      {payment.result ? (
                        <Badge variant={payment.result === 'COMPLETED' ? 'default' : 'secondary'}>
                          {getCodeName('PAYMENT_RESULT', payment.result)}
                        </Badge>
                      ) : (
                        <p className="text-sm">-</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 비고 (무역) */}
      {data.notes && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">비고</h3>
          <div className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{data.notes}</p>
          </div>
        </div>
      )}

      {/* 영업 비고 */}
      {data.salesNotes && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">영업 비고</h3>
          <div className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{data.salesNotes}</p>
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
  );
}

