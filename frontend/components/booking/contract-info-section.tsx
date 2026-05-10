'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { FileText } from 'lucide-react';
import type { TradeOrder } from '@/lib/hooks/use-trade-orders';
import type { TradeContract } from '@/lib/hooks/use-trade-contracts';
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

interface ContractInfoSectionProps {
  data: TradeOrder | TradeContract;
  showShippingConditions?: boolean; // 선적 조건 표시 여부 (기본값: true)
  showTotalOrderCount?: boolean; // 전체 주문 개수 표시 여부 (기본값: true, 부킹 수정 등에서는 false)
  className?: string; // 추가 클래스명
}

export function ContractInfoSection({
  data,
  showShippingConditions = true,
  showTotalOrderCount = true,
  className = '',
}: ContractInfoSectionProps) {
  const { data: exportCountryCodes } = useCodesByCategory('EXPORT_COUNTRY');
  const { data: exporterCodes } = useCodesByCategory('EXPORTER');

  const getCodeName = (category: string, value?: string | null) => {
    if (!value) return null;
    const codes =
      category === 'EXPORT_COUNTRY'
        ? exportCountryCodes
        : category === 'EXPORTER'
          ? exporterCodes
          : [];
    // 대소문자 구분 없이 비교 (백엔드의 normalizeKey와 일치)
    const normalizedValue = value.trim().toUpperCase();
    return codes?.find((code) => code.value?.trim().toUpperCase() === normalizedValue)?.name || null;
  };

  // TradeOrder인지 TradeContract인지 확인
  const isTradeOrder = 'sequence' in data;
  const orderData = isTradeOrder ? (data as TradeOrder) : null;
  const contractData = isTradeOrder ? null : (data as TradeContract);

  // 계약 정보가 없으면 표시하지 않음
  if (!data.contractNo && !data.contractGoogleDriveFileId) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
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
          <p className="text-sm">
            {formatDate(
              orderData?.orderDate || contractData?.orderDate || null
            )}
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">수출국</Label>
          <p className="text-sm">
            {contractData?.exportCountryName ||
              orderData?.exportCountryName ||
              getCodeName('EXPORT_COUNTRY', contractData?.exportCountry) ||
              getCodeName('EXPORT_COUNTRY', orderData?.exportCountryCode) ||
              contractData?.exportCountry ||
              orderData?.exportCountryCode ||
              '-'}
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">수출사</Label>
          <p className="text-sm">
            {contractData?.exporterName ||
              orderData?.exporterName ||
              getCodeName('EXPORTER', contractData?.exporter) ||
              getCodeName('EXPORTER', orderData?.exporterCode) ||
              contractData?.exporter ||
              orderData?.exporterCode ||
              '-'}
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">커미션 $</Label>
          <p className="text-sm">{data.commissionDollar || '-'}</p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-muted-foreground">커미션 월</Label>
          <p className="text-sm">{data.commissionMonth || '-'}</p>
        </div>
        {/* 계약인 경우에만 전체 주문 개수 / 현재 주문 개수 표시 (상세 화면 등 참고용, 부킹 수정에서는 생략 가능) */}
        {contractData && showTotalOrderCount && (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">전체 주문 개수</Label>
            <p className="text-sm">
              {contractData.totalOrderCount != null
                ? `현재 ${contractData.orderCount ?? 0}개 / 전체 ${contractData.totalOrderCount}개`
                : contractData.orderCount != null
                  ? `현재 ${contractData.orderCount}개`
                  : '-'}
            </p>
          </div>
        )}
      </div>
      {/* 선적 조건 (계약 레벨) */}
      {showShippingConditions && (
        <div className="grid grid-cols-6 gap-4 pt-3 mt-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">쿼터 유무</Label>
            <p className="text-sm">
              {data.quota === 'Y' ? '예' : data.quota === 'N' ? '아니오' : '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">훈증 유무</Label>
            <p className="text-sm">
              {data.fumigation === 'Y' ? '예' : data.fumigation === 'N' ? '아니오' : '-'}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">관세 유무</Label>
            <p className="text-sm">
              {data.customsDuty === 'Y' ? '예' : data.customsDuty === 'N' ? '아니오' : '-'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

