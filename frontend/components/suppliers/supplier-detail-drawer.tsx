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
import { useSupplier, Supplier } from '@/lib/hooks/use-suppliers';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Edit, X, Trash2 } from 'lucide-react';
import { useDeleteSupplier } from '@/lib/hooks/use-suppliers';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return phone;
};

interface SupplierDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId?: number | null;
  onEdit?: (supplier: Supplier) => void;
}

export function SupplierDetailDrawer({
  open,
  onOpenChange,
  supplierId,
  onEdit,
}: SupplierDetailDrawerProps) {
  const { data, isLoading, refetch } = useSupplier(supplierId ?? undefined);
  const deleteMutation = useDeleteSupplier();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && supplierId) {
      refetch();
    }
  }, [open, supplierId, refetch]);

  const handleDelete = async () => {
    if (!supplierId) return;
    try {
      await deleteMutation.mutateAsync(supplierId);
      setDeleteDialogOpen(false);
      onOpenChange(false);
    } catch (error) {
      // 에러는 mutation에서 toast로 처리됨
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DrawerTitle>공급자 상세정보</DrawerTitle>
                <DrawerDescription>
                  공급자의 기본 정보를 확인할 수 있습니다.
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
                    <Label className="text-sm font-medium text-muted-foreground">상호 (회사명)</Label>
                    <p className="mt-1 text-sm font-semibold">{data.companyName || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">성명 (대표)</Label>
                    <p className="mt-1 text-sm">{data.representativeName || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">사업자등록번호</Label>
                    <p className="mt-1 text-sm font-mono">{data.businessRegistrationNumber || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">전화번호 (TEL)</Label>
                    <p className="mt-1 text-sm">{formatPhone(data.tel)}</p>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium text-muted-foreground">주소</Label>
                    <p className="mt-1 text-sm">{data.address || '-'}</p>
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
                disabled={!data || deleteMutation.isPending}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                삭제
              </Button>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>공급자 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 공급자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
