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
import { useWarehouse, Warehouse } from '@/lib/hooks/use-warehouses';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Edit, X, Trash2, Plus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { 
  useWarehouseIgobis, 
  WarehouseIgobi, 
  useCreateWarehouseIgobi,
  useUpdateWarehouseIgobi,
  useDeleteWarehouseIgobi,
  CreateWarehouseIgobiDto,
} from '@/lib/hooks/use-warehouse-igobi';
import { WarehouseIgobiFormDrawer } from '@/components/warehouse-igobi/warehouse-igobi-form-drawer';
import { toast } from '@/components/ui/use-toast';
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
    if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
    return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
  if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits;
};

interface WarehouseDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseId?: number | null;
  onEdit?: (warehouse: Warehouse) => void;
  onDelete?: (warehouse: Warehouse) => void;
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

export function WarehouseDetailDrawer({
  open,
  onOpenChange,
  warehouseId,
  onEdit,
  onDelete,
}: WarehouseDetailDrawerProps) {
  const { data, isLoading, refetch } = useWarehouse(warehouseId ?? undefined);
  
  // 이고비 목록 조회
  const { data: igobis = [], isLoading: isIgobisLoading, refetch: refetchIgobis } = useWarehouseIgobis(
    warehouseId ? { warehouseId } : undefined
  );

  const [igobiDrawerOpen, setIgobiDrawerOpen] = React.useState(false);
  const [igobiDrawerMode, setIgobiDrawerMode] = React.useState<'create' | 'edit'>('create');
  const [selectedIgobi, setSelectedIgobi] = React.useState<WarehouseIgobi | null>(null);
  const [deleteIgobiDialogOpen, setDeleteIgobiDialogOpen] = React.useState(false);
  const [igobiToDelete, setIgobiToDelete] = React.useState<WarehouseIgobi | null>(null);

  const createIgobiMutation = useCreateWarehouseIgobi();
  const updateIgobiMutation = useUpdateWarehouseIgobi();
  const deleteIgobiMutation = useDeleteWarehouseIgobi();

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && warehouseId) {
      refetch();
      refetchIgobis();
    }
  }, [open, warehouseId, refetch, refetchIgobis]);

  const handleCreateIgobi = () => {
    setSelectedIgobi(null);
    setIgobiDrawerMode('create');
    setIgobiDrawerOpen(true);
  };

  const handleEditIgobi = (igobi: WarehouseIgobi) => {
    setSelectedIgobi(igobi);
    setIgobiDrawerMode('edit');
    setIgobiDrawerOpen(true);
  };

  const handleDeleteIgobi = (igobi: WarehouseIgobi) => {
    setIgobiToDelete(igobi);
    setDeleteIgobiDialogOpen(true);
  };

  const confirmDeleteIgobi = async () => {
    if (!igobiToDelete) return;
    try {
      await deleteIgobiMutation.mutateAsync(igobiToDelete.id);
      toast({
        title: '이고비 삭제 완료',
        description: `${formatDate(igobiToDelete.baseDate)} 기준 이고비를 삭제했습니다.`,
      });
      setDeleteIgobiDialogOpen(false);
      setIgobiToDelete(null);
      refetchIgobis();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        '이고비 삭제 중 오류가 발생했습니다.';
      toast({
        title: '삭제 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    }
  };

  const handleIgobiSubmit = async (dto: CreateWarehouseIgobiDto) => {
    if (!data || !warehouseId) {
      throw new Error('창고 정보를 불러올 수 없습니다.');
    }

    try {
      if (igobiDrawerMode === 'create') {
        // warehouseId를 직접 사용
        await createIgobiMutation.mutateAsync({
          ...dto,
          warehouseId: warehouseId,
        });
        toast({
          title: '이고비 추가 완료',
          description: `${formatDate(dto.baseDate)} 기준 이고비를 추가했습니다.`,
        });
      } else if (selectedIgobi) {
        await updateIgobiMutation.mutateAsync({
          id: selectedIgobi.id,
          data: {
            ...dto,
            warehouseId: warehouseId,
          },
        });
        toast({
          title: '이고비 수정 완료',
          description: `${formatDate(dto.baseDate)} 기준 이고비를 수정했습니다.`,
        });
      }
      setIgobiDrawerOpen(false);
      setSelectedIgobi(null);
      refetchIgobis();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        '이고비 저장 중 오류가 발생했습니다.';
      toast({
        title: '저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>창고 업체 상세정보</DrawerTitle>
              <DrawerDescription>
                창고 업체의 기본 정보와 주소 정보를 확인할 수 있습니다.
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
                  <Label className="text-sm font-medium text-muted-foreground">업체명 / 연락처</Label>
                  <p className="mt-1 text-sm">
                    {data.name || '-'} {data.phone ? `/ ${formatPhone(data.phone)}` : ''}
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
                  <Label className="text-sm font-medium text-muted-foreground">우편번호</Label>
                  <p className="mt-1 text-sm">{data.postalCode || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">주소</Label>
                  <p className="mt-1 text-sm">{data.address || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">상세주소</Label>
                  <p className="mt-1 text-sm">{data.addressDetail || '-'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">내부 계근대 사용</Label>
                  <p className="mt-1">
                    <Badge variant={data.useInternalGyegeundae ? 'default' : 'outline'}>
                      {data.useInternalGyegeundae ? '사용' : '미사용'}
                    </Badge>
                  </p>
                </div>
                {!data.useInternalGyegeundae && (
                  <>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">계근대 우편번호</Label>
                      <p className="mt-1 text-sm">{data.gyegeundaePostalCode || '-'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-muted-foreground">계근대 주소</Label>
                      <p className="mt-1 text-sm">{data.gyegeundaeAddress || '-'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-muted-foreground">계근대 상세주소</Label>
                      <p className="mt-1 text-sm">{data.gyegeundaeAddressDetail || '-'}</p>
                    </div>
                  </>
                )}
                {data.notes && (
                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium text-muted-foreground">비고</Label>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{data.notes}</p>
                  </div>
                )}
              </div>

              {/* 이고비 목록 */}
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">이고비 목록</Label>
                    <p className="text-xs text-muted-foreground">기준일별 이고비 정보</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {igobis.length > 0 ? `${igobis.length}건` : '0건'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCreateIgobi}
                      disabled={!data}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      추가
                    </Button>
                  </div>
                </div>
                {isIgobisLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : igobis.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    등록된 이고비가 없습니다.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {igobis.map((igobi: WarehouseIgobi) => (
                      <div
                        key={igobi.id}
                        className="rounded-md border bg-background p-3 space-y-2 text-sm hover:bg-accent/40 transition-colors cursor-pointer"
                        onClick={() => handleEditIgobi(igobi)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">
                            기준일: {formatDate(igobi.baseDate)}
                          </span>
                          <span className="text-sm font-semibold text-foreground">
                            {typeof igobi.igobi === 'number' 
                              ? igobi.igobi.toLocaleString('ko-KR')
                              : Number(igobi.igobi || 0).toLocaleString('ko-KR')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
              disabled={!data}
              onClick={() => {
                if (data && onDelete) {
                  onDelete(data);
                }
              }}
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

      <WarehouseIgobiFormDrawer
        open={igobiDrawerOpen}
        onOpenChange={setIgobiDrawerOpen}
        mode={igobiDrawerMode}
        warehouseIgobi={selectedIgobi}
        warehouseId={warehouseId ?? undefined}
        warehouseName={data?.name ?? undefined}
        onSubmit={handleIgobiSubmit}
        onDelete={handleDeleteIgobi}
      />

      <AlertDialog open={deleteIgobiDialogOpen} onOpenChange={setDeleteIgobiDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이고비를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {igobiToDelete && (
                <>
                  {formatDate(igobiToDelete.baseDate)} 기준 이고비를 삭제합니다.
                  <br />
                  삭제된 정보는 복구할 수 없습니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteIgobi}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Drawer>
  );
}
