'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText } from 'lucide-react';
import { TradeContract } from '@/lib/hooks/use-trade-contracts';
import { TradeOrder } from '@/lib/hooks/use-trade-orders';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';
import { useCodesByCategory } from '@/lib/hooks/use-codes';

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

/** 커미션 월 표시: "YYYY-MM" → "2025. 11." (발주일과 같은 형식) */
const formatYearMonth = (value?: string | null) => {
  if (!value || !String(value).trim()) return '-';
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})/);
  if (!match) return trimmed;
  const year = match[1];
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return trimmed;
  return `${year}. ${month.toString().padStart(2, '0')}.`;
};

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface TradeContractDetailContentProps {
  data: TradeContract | TradeOrder;
  showTotalOrderCount?: boolean; // 계약에서만 true
  showContractInfo?: boolean | 'conditional'; // 계약에서는 항상 true, 발주에서는 'conditional' (계약 확정 상태일 때만)
  showContractStatusManagement?: boolean; // 계약에서만 true
  onContractStatusChange?: (newStatus: string) => void; // 계약에서만 필요
  contractStatusCodes?: Array<{ value: string | null; name: string }>; // 계약에서만 필요
  updateContractMutation?: { isPending: boolean }; // 계약에서만 필요
}

export function TradeContractDetailContent({
  data,
  showTotalOrderCount = false,
  showContractInfo = true,
  showContractStatusManagement = false,
  onContractStatusChange,
  contractStatusCodes = [],
  updateContractMutation,
}: TradeContractDetailContentProps) {
  const { data: tradeGradeCodes } = useCodesByCategory('TRADE_GRADE');
  const { data: packingCodes } = useCodesByCategory('PACKING_TYPE');
  const { data: currencyCodes } = useCodesByCategory('CURRENCY');
  const { data: exportCountryCodes } = useCodesByCategory('EXPORT_COUNTRY');
  const { data: exporterCodes } = useCodesByCategory('EXPORTER');
  const { data: shippingLineCodes } = useCodesByCategory('SHIPPING_LINE');
  const { data: destinationCodes } = useCodesByCategory('DESTINATION_PORT');
  const { data: productCodes } = useCodeMastersByGroup('PRODUCT');

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

  // TradeOrder인지 TradeContract인지 확인
  const isTradeOrder = 'sequence' in data;
  const contractStatus = isTradeOrder ? (data as TradeOrder).contractStatus : undefined;

  // 계약 정보 표시 여부 결정
  const shouldShowContractInfo =
    showContractInfo === true ||
    (showContractInfo === 'conditional' && contractStatus === 'CONTRACT');

  return (
    <div className="space-y-0">
      {/* 발주 기본 정보 (등록 화면과 동일한 순서: 발주일, 수출국, 수출사, 도착항, 커미션$, 커미션월, 전체 주문 개수) */}
      <div className="space-y-3 pb-6">
        <h3 className="text-sm font-semibold text-foreground">발주 기본 정보</h3>
        <div className="grid grid-cols-6 gap-4 pt-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">발주일</Label>
            <p className="text-sm">{formatDate(data.orderDate)}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">수출국</Label>
            <p className="text-sm">
              {isTradeOrder
                ? (data as TradeOrder).exportCountryName ||
                  getCodeName('EXPORT_COUNTRY', (data as TradeOrder).exportCountryCode) ||
                  '-'
                : (data as TradeContract).exportCountryName ||
                  getCodeName('EXPORT_COUNTRY', (data as TradeContract).exportCountry) ||
                  '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">수출사</Label>
            <p className="text-sm">
              {isTradeOrder
                ? (data as TradeOrder).exporterName ||
                  getCodeName('EXPORTER', (data as TradeOrder).exporterCode) ||
                  '-'
                : (data as TradeContract).exporterName ||
                  getCodeName('EXPORTER', (data as TradeContract).exporter) ||
                  '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">도착항</Label>
            <p className="text-sm">
              {isTradeOrder
                ? (data as TradeOrder).destinationName ||
                  getCodeName('DESTINATION_PORT', (data as TradeOrder).destinationCode) ||
                  '-'
                : (data as TradeContract).destinationName ||
                  getCodeName('DESTINATION_PORT', (data as TradeContract).destination) ||
                  '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">커미션 $</Label>
            <p className="text-sm">{data.commissionDollar || '-'}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">커미션 월</Label>
            <p className="text-sm">{formatYearMonth(data.commissionMonth)}</p>
          </div>
          {(showTotalOrderCount || (isTradeOrder && data.totalOrderCount != null)) && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">전체 주문 개수</Label>
              <p className="text-sm">{data.totalOrderCount ?? '-'}</p>
            </div>
          )}
          {isTradeOrder && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">선사</Label>
              <p className="text-sm">
                {(data as TradeOrder).shippingLineName ||
                  getCodeName('SHIPPING_LINE', (data as TradeOrder).shippingLineCode) ||
                  '-'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 월별 주문 계획 (계약이고 전체 주문 개수가 2개 이상일 때만 표시) */}
      {(() => {
        if (isTradeOrder) return null;
        if (!showTotalOrderCount) return null;
        const contract = data as TradeContract;
        const totalOrderCount = contract.totalOrderCount;
        if (totalOrderCount === null || totalOrderCount === undefined || totalOrderCount < 2) return null;
        if (!contract.monthlyOrderPlan || Object.keys(contract.monthlyOrderPlan).length === 0) return null;
        
        return (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">월별 주문 계획</h3>
          <div className="pt-3">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">년월</th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-muted-foreground">실제 / 계획</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(contract.monthlyOrderPlan)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([yearMonth, plannedCount]) => {
                      const [year, month] = yearMonth.split('-');
                      const yearNum = parseInt(year, 10);
                      const monthNum = parseInt(month, 10);
                      const displayText = `${yearNum}년 ${monthNum}월`;
                      const monthlyOrderActual = contract.monthlyOrderActual || {};
                      const actualCount = monthlyOrderActual[yearMonth] || 0;
                      const isShortage = actualCount < plannedCount;
                      
                      return (
                        <tr key={yearMonth} className="border-b border-border">
                          <td className="py-2 px-3 text-sm">{displayText}</td>
                          <td className={`py-2 px-3 text-sm text-right font-medium ${
                            isShortage ? 'text-destructive' : ''
                          }`}>
                            {actualCount} / {plannedCount}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2 px-3 text-sm">총 계획</td>
                    <td className="py-2 px-3 text-sm text-right">
                      {Object.values(contract.monthlyOrderPlan).reduce((sum, count) => sum + count, 0)}개
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        );
      })()}

      {/* 상품 및 가격 정보 */}
      <div className="space-y-3 pt-6 pb-6 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground">상품 및 가격 정보</h3>
        <div className="grid grid-cols-6 gap-4 pt-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">상품</Label>
            <p className="text-sm">
              {getCodeName('PRODUCT', data.productName) || data.productName || '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">등급</Label>
            <p className="text-sm">
              {isTradeOrder
                ? (data as TradeOrder).grade || '-'
                : (data as TradeContract).gradeName ||
                  getCodeName('TRADE_GRADE', (data as TradeContract).grade) ||
                  '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">패킹 타입</Label>
            <p className="text-sm">
              {isTradeOrder
                ? (data as TradeOrder).packingType || '-'
                : (data as TradeContract).packingName ||
                  (data as TradeContract).packingType ||
                  '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">단가</Label>
            <p className="text-sm">{data.unitPrice != null ? formatNumber(data.unitPrice) : '-'}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">통화단위</Label>
            <p className="text-sm">
              {isTradeOrder
                ? (data as TradeOrder).currencyName ||
                  getCodeName('CURRENCY', (data as TradeOrder).currencyCode) ||
                  '-'
                : (data as TradeContract).currencyName ||
                  getCodeName('CURRENCY', (data as TradeContract).currency) ||
                  '-'}
            </p>
          </div>
        </div>
      </div>

      {/* 선적 조건 */}
      <div className="space-y-3 pt-6 pb-6 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground">선적 조건</h3>
        <div className="grid grid-cols-6 gap-4 pt-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">쿼터 유무</Label>
            <p className="text-sm">{data.quota === 'Y' ? '예' : data.quota === 'N' ? '아니오' : '-'}</p>
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
        {data.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <Label className="text-sm font-medium text-muted-foreground">비고</Label>
            <p className="mt-2 text-sm whitespace-pre-wrap">{data.notes}</p>
          </div>
        )}
      </div>

      {/* 계약 정보 */}
      {shouldShowContractInfo && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">계약 정보</h3>
          <div className="grid grid-cols-6 gap-4 pt-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">계약번호</Label>
              <p className="text-sm">{data.contractNo || '-'}</p>
            </div>
            {data.contractGoogleDriveFileId && (
              <div className="space-y-2 col-span-5">
                <Label className="text-sm font-medium text-muted-foreground">계약서 파일</Label>
                <div className="mt-1">
                  <a
                    href={`https://drive.google.com/file/d/${data.contractGoogleDriveFileId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {data.contractFileName || '계약서.pdf'}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 계약 상태 관리 (계약에서만) */}
      {showContractStatusManagement && onContractStatusChange && (
        <div className="space-y-3 pt-6 pb-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground">계약 상태 관리</h3>
          <div className="grid grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">계약 상태</Label>
              <Select
                value={(data as TradeContract).contractStatus || undefined}
                onValueChange={onContractStatusChange}
                disabled={updateContractMutation?.isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {contractStatusCodes.map((code) => (
                    <SelectItem key={code.value} value={code.value || 'NULL'}>
                      {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <Separator />

      {/* 기록 */}
      <div className="space-y-3 pt-6">
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


