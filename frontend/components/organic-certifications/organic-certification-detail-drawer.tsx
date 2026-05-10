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
import { Loader2, Edit, Trash2, X } from 'lucide-react';
import { useOrganicCertification } from '@/lib/hooks/use-organic-certifications';
import { useCodeMastersByGroup } from '@/lib/hooks/use-code-masters';

interface OrganicCertificationDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificationId: number | null;
  onEdit: () => void;
  onDelete: () => void;
}

const formatNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value);
};

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

export function OrganicCertificationDetailDrawer({
  open,
  onOpenChange,
  certificationId,
  onEdit,
  onDelete,
}: OrganicCertificationDetailDrawerProps) {
  const { data: certification, isLoading, refetch } = useOrganicCertification(certificationId || undefined);
  const { data: detailProductCodes } = useCodeMastersByGroup('ORGANIC_DETAIL_PRODUCT');
  
  // 세부품목 코드 맵 생성
  const detailProductMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (detailProductCodes ?? []).forEach((code) => {
      if (code.value) {
        map.set(code.value, code.name);
      }
    });
    return map;
  }, [detailProductCodes]);
  
  // 세부품목 라벨 가져오기
  const getDetailProductLabels = React.useCallback((products?: string[] | null) => {
    if (!products || products.length === 0) return '-';
    return products.map((value) => detailProductMap.get(value) || value).join(', ');
  }, [detailProductMap]);

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && certificationId) {
      refetch();
    }
  }, [open, certificationId, refetch]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>유기축산 인증 상세정보</DrawerTitle>
              <DrawerDescription>유기축산 인증 정보를 확인하고 관리할 수 있습니다.</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : certification ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">업체명</Label>
                  <p className="mt-1 text-sm">{certification.companyName || '-'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">대표자</Label>
                  <p className="mt-1 text-sm">{certification.producer || '-'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">전화번호</Label>
                  <p className="mt-1 text-sm">{formatPhone(certification.phone)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">대표품목</Label>
                  <p className="mt-1 text-sm">{certification.mainProduct || '-'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">인증분류</Label>
                  <p className="mt-1 text-sm">{certification.certificationType || '-'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">농가수</Label>
                  <p className="mt-1 text-sm">{certification.farmCount || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">주소</Label>
                  <p className="mt-1 text-sm">{certification.address || '-'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">인증 시작일</Label>
                  <p className="mt-1 text-sm">{formatDate(certification.certificationStartDate)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">인증 종료일</Label>
                  <p className="mt-1 text-sm">{formatDate(certification.certificationEndDate)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">재배면적(㎡)</Label>
                  <p className="mt-1 text-sm">{formatNumber(certification.cultivationAreaM2)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">연간 생산 목표</Label>
                  <p className="mt-1 text-sm">{formatNumber(certification.annualProductionTarget)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">사육두수</Label>
                  <p className="mt-1 text-sm">{formatNumber(certification.livestockCount)}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">납품처</Label>
                  <p className="mt-1 text-sm">{certification.deliveryDestination || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">세부품목</Label>
                  <p className="mt-1 text-sm">{getDetailProductLabels(certification.detailProducts)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">데이터를 불러올 수 없습니다.</div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
            <Button
              variant="destructive"
              disabled={!certification}
              onClick={onDelete}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              삭제
            </Button>
            <Button
              variant="default"
              disabled={!certification}
              onClick={onEdit}
            >
              <Edit className="mr-1.5 h-4 w-4" />
              수정
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

