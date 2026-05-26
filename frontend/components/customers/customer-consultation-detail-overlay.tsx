'use client';

import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { Consultation } from '@/lib/hooks/use-consultations';
import { ActivityDetailRow, formatActivityDate } from './customer-activity-shared';

interface CustomerConsultationDetailOverlayProps {
  consultation: Consultation;
  onClose: () => void;
  labelOr: (map: Map<string, string>, value?: string | null) => string;
  consultationTypeMap: Map<string, string>;
  consultationInOutMap: Map<string, string>;
  consultationSourceMap: Map<string, string>;
  consultationRequestWeightMap: Map<string, string>;
  consultationSalesGradeMap: Map<string, string>;
  consultationPackingTypeMap: Map<string, string>;
  consultationProductMap: Map<string, string>;
  consultationProductCategoryMap: Map<number, string>;
}

export function CustomerConsultationDetailOverlay({
  consultation,
  onClose,
  labelOr,
  consultationTypeMap,
  consultationInOutMap,
  consultationSourceMap,
  consultationRequestWeightMap,
  consultationSalesGradeMap,
  consultationPackingTypeMap,
  consultationProductMap,
  consultationProductCategoryMap,
}: CustomerConsultationDetailOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col border-r border-border bg-background/98 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">상담 상세 보기</p>
          <p className="text-xs text-muted-foreground">
            {formatActivityDate(consultation.consultationDate)} ·{' '}
            {consultation.managerName || '담당자 없음'}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          목록으로
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">상담 기본 정보</h4>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {consultation.type ? (
                  <Badge variant="secondary">{labelOr(consultationTypeMap, consultation.type)}</Badge>
                ) : null}
                {consultation.inOut ? (
                  <Badge variant="outline">{labelOr(consultationInOutMap, consultation.inOut)}</Badge>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <ActivityDetailRow label="상담일" value={formatActivityDate(consultation.consultationDate)} />
              <ActivityDetailRow label="담당자" value={consultation.managerName || '-'} />
              <ActivityDetailRow
                label="상담 유형"
                value={consultation.type ? labelOr(consultationTypeMap, consultation.type) : '-'}
              />
              <ActivityDetailRow
                label="유입 경로"
                value={consultation.source ? labelOr(consultationSourceMap, consultation.source) : '-'}
              />
              <ActivityDetailRow
                label="IN/OUT"
                value={consultation.inOut ? labelOr(consultationInOutMap, consultation.inOut) : '-'}
              />
              <ActivityDetailRow label="제안가" value={consultation.proposedPrice || '-'} />
              <ActivityDetailRow label="적출 여부" value={consultation.hasUnloading ? '예' : '아니오'} />
              <ActivityDetailRow label="하역 여부" value={consultation.hasHandling ? '예' : '아니오'} />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold">제품 정보</h4>
            {consultation.products && consultation.products.length > 0 ? (
              <div className="space-y-3">
                {consultation.products.map((product, idx) => {
                  const categoryName =
                    product.productCategoryId != null
                      ? consultationProductCategoryMap.get(product.productCategoryId) || '-'
                      : '-';
                  const productName = product.productName
                    ? labelOr(consultationProductMap, product.productName)
                    : '-';
                  const gradeName = product.grade
                    ? labelOr(consultationSalesGradeMap, product.grade)
                    : '-';
                  const packingName = product.packingType
                    ? labelOr(consultationPackingTypeMap, product.packingType)
                    : '-';
                  const vehicleName = product.requestedVehicle
                    ? labelOr(consultationRequestWeightMap, product.requestedVehicle)
                    : '-';
                  return (
                    <div
                      key={`${product.id}_${product.productName ?? ''}_${idx}`}
                      className="space-y-4 rounded-lg border bg-card p-4"
                    >
                      <div className="grid gap-4 md:grid-cols-4">
                        <ActivityDetailRow label="제품 분류" value={categoryName || '-'} />
                        <ActivityDetailRow label="문의 제품" value={productName || '-'} />
                        <ActivityDetailRow label="등급(세일즈)" value={gradeName || '-'} />
                        <ActivityDetailRow label="포장 유형" value={packingName || '-'} />
                        <ActivityDetailRow label="요청 중량" value={product.requestedWeight || '-'} />
                        <ActivityDetailRow label="요청 차량" value={vehicleName || '-'} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : consultation.productName || consultation.inquiryProduct ? (
              <div className="space-y-2 rounded-lg border bg-card p-4">
                <ActivityDetailRow
                  label="문의 제품"
                  value={
                    consultation.productName
                      ? labelOr(consultationProductMap, consultation.productName)
                      : consultation.inquiryProduct || '-'
                  }
                />
                <ActivityDetailRow
                  label="등급(세일즈)"
                  value={
                    consultation.grade ? labelOr(consultationSalesGradeMap, consultation.grade) : '-'
                  }
                />
                <ActivityDetailRow
                  label="요청 차량"
                  value={
                    consultation.requestedWeight
                      ? labelOr(consultationRequestWeightMap, consultation.requestedWeight)
                      : '-'
                  }
                />
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                제품 정보가 없습니다.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold">배송 정보</h4>
            <div className="grid gap-4 md:grid-cols-4">
              <ActivityDetailRow label="우편번호" value={consultation.deliveryPostalCode || '-'} />
              <ActivityDetailRow label="지역" value={consultation.deliveryRegion || '-'} />
              <ActivityDetailRow label="시/군/구" value={consultation.deliveryCity || '-'} />
              <div className="hidden md:block" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ActivityDetailRow label="주소" value={consultation.deliveryAddress || '-'} />
              <ActivityDetailRow label="상세주소" value={consultation.deliveryAddressDetail || '-'} />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">상담 메모</h4>
            <div className="min-h-[80px] rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
              {consultation.notes ? (
                consultation.notes
              ) : (
                <span className="text-muted-foreground">메모가 없습니다.</span>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
