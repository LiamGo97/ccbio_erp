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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Edit, Loader2, Trash2, X } from 'lucide-react';
import { Code, useCode, useCodesByCategory } from '@/lib/hooks/use-codes';

interface CodeDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  codeId?: number | null;
  onEdit?: (code: Code) => void;
  onDelete?: (code: Code) => void;
}

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium break-all">{value ?? '-'}</span>
  </div>
);

export function CodeDetailDrawer({
  open,
  onOpenChange,
  codeId,
  onEdit,
  onDelete,
}: CodeDetailDrawerProps) {
  const { data, isLoading, error } = useCode(codeId ?? undefined);
  const { data: productCategories } = useCodesByCategory('PRODUCT_CATEGORY');

  const getParentName = React.useCallback(
    (parentId?: number | null) => {
      if (!parentId || !productCategories) return '-';
      const parent = productCategories.find((cat) => cat.id === parentId);
      return parent ? parent.name : parentId;
    },
    [productCategories],
  );

  if (!codeId) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '520px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle>코드 상세</DrawerTitle>
                <DrawerDescription>코드 정보를 선택해주세요.</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">코드를 선택하면 상세 정보가 표시됩니다.</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '520px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DrawerTitle>코드 상세</DrawerTitle>
              <DrawerDescription>코드의 세부 정보를 확인하세요.</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error || !data ? (
          <div className="flex items-center justify-center h-64 px-4 text-center text-sm text-muted-foreground">
            코드를 불러오는 중 오류가 발생했습니다.
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-semibold">{data.name}</p>
                    <p className="text-sm text-muted-foreground">
                      그룹: {data.group}
                    </p>
                  </div>
                  {data.value && (
                    <Badge variant="secondary" className="text-xs">
                      {data.value}
                    </Badge>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label="그룹" value={data.group} />
                  <InfoRow label="정렬 순서" value={data.order} />
                  <InfoRow label="값" value={data.value || '-'} />
                  <InfoRow label="식별자(ID)" value={data.id} />
                  {data.group === 'PRODUCT' && (
                    <>
                      <InfoRow
                        label="제품 카테고리"
                        value={data.parentId ? getParentName(data.parentId) : '-'}
                      />
                      <div />
                    </>
                  )}
                  <InfoRow
                    label="별칭"
                    value={data.aliases ? data.aliases.split('\n').map((alias, idx) => (
                      <span key={alias} className="block">
                        {alias}
                      </span>
                    )) : '-'}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <InfoRow
                    label="생성일"
                    value={new Date(data.createdAt).toLocaleString()}
                  />
                  <InfoRow
                    label="수정일"
                    value={new Date(data.updatedAt).toLocaleString()}
                  />
                </div>
              </div>
            </ScrollArea>

            <div className="border-t border-border p-4">
              <div className="flex justify-end gap-2">
                {onDelete && (
                  <Button
                    variant="destructive"
                    onClick={() => onDelete(data)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    삭제
                  </Button>
                )}
                {onEdit && (
                  <Button
                    variant="default"
                    onClick={() => onEdit(data)}
                  >
                    <Edit className="mr-1.5 h-4 w-4" />
                    수정
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

