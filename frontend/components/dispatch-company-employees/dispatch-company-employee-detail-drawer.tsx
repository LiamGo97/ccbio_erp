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
import { useDispatchUser, DispatchUser } from '@/lib/hooks/use-dispatch-users';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Edit, Trash2, X } from 'lucide-react';

interface DispatchCompanyEmployeeDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchUserId?: number | null;
  onEdit?: (dispatchUser: DispatchUser) => void;
  onDelete?: (dispatchUser: DispatchUser) => void;
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


export function DispatchCompanyEmployeeDetailDrawer({
  open,
  onOpenChange,
  dispatchUserId,
  onEdit,
  onDelete,
}: DispatchCompanyEmployeeDetailDrawerProps) {
  const { data, isLoading, refetch } = useDispatchUser(dispatchUserId ?? undefined);

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && dispatchUserId) {
      refetch();
    }
  }, [open, dispatchUserId, refetch]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>배차 업체 직원 상세정보</DrawerTitle>
              <DrawerDescription>
                배차 업체 직원의 기본 정보를 확인할 수 있습니다.
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
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">이메일</Label>
                  <p className="mt-1 text-sm font-semibold">{data.user?.email || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">이름</Label>
                  <p className="mt-1 text-sm font-semibold">{data.name || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">배차 업체</Label>
                  <p className="mt-1 text-sm font-semibold">
                    {data.dispatchCompany?.name || '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">상태</Label>
                  <p className="mt-1">
                    <Badge variant={data.status ? 'default' : 'secondary'}>
                      {data.status ? '활성' : '비활성'}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">등록일</Label>
                  <p className="mt-1 text-sm">{formatDate(data.createdAt)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">데이터를 불러올 수 없습니다.</div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="flex justify-end gap-2">
            {onDelete && data && (
              <Button
                variant="outline"
                onClick={() => {
                  if (data && onDelete) {
                    onDelete(data);
                  }
                }}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                삭제
              </Button>
            )}
            {onEdit && data && (
              <Button
                variant="default"
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
    </Drawer>
  );
}

