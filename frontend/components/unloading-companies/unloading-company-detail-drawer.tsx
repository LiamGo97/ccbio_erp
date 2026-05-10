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
import { useUnloadingCompany, UnloadingCompany } from '@/lib/hooks/use-unloading-companies';
import { Label } from '@/components/ui/label';
import { Loader2, Edit, X } from 'lucide-react';

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

interface UnloadingCompanyDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unloadingCompanyId?: number | null;
  onEdit?: (unloadingCompany: UnloadingCompany) => void;
}

export function UnloadingCompanyDetailDrawer({
  open,
  onOpenChange,
  unloadingCompanyId,
  onEdit,
}: UnloadingCompanyDetailDrawerProps) {
  const { data, isLoading, refetch } = useUnloadingCompany(unloadingCompanyId ?? undefined);

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && unloadingCompanyId) {
      refetch();
    }
  }, [open, unloadingCompanyId, refetch]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>하차 업체 상세정보</DrawerTitle>
              <DrawerDescription>
                하차 업체의 기본 정보를 확인할 수 있습니다.
              </DrawerDescription>
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
          ) : data ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">대표자명</Label>
                  <p className="mt-1 text-sm font-semibold">{data.representativeName || '-'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">연락처</Label>
                  <p className="mt-1 text-sm">{formatPhone(data.contact)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">등록일</Label>
                  <p className="mt-1 text-sm">
                    {data.createdAt
                      ? new Date(data.createdAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })
                      : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">수정일</Label>
                  <p className="mt-1 text-sm">
                    {data.updatedAt
                      ? new Date(data.updatedAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })
                      : '-'}
                  </p>
                </div>
              </div>
              {data.notes && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">비고</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{data.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">데이터를 불러올 수 없습니다.</div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
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
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

