'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { SalesDetailDrawer } from '@/components/sales/sales-detail-drawer';
import { SalesDeliveryDetailDrawer } from '@/components/sales-delivery/sales-delivery-detail-drawer';

export interface MismatchDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesId?: string | null;
  deliveryId?: string | null;
  onSuccess?: () => void;
}

export function MismatchDetailDrawer({
  open,
  onOpenChange,
  salesId,
  deliveryId,
  onSuccess,
}: MismatchDetailDrawerProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full flex flex-col z-[60]"
        noOverlay
        style={{
          width: 'min(1800px, 95vw)',
          maxWidth: '95vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      >
        <DrawerHeader className="border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DrawerTitle>판매·운송 상세정보</DrawerTitle>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* 왼쪽: 판매 상세정보 (읽기 전용) */}
          {open && salesId && (
            <div className="flex-1 min-w-0 border-r overflow-hidden flex flex-col">
              <SalesDetailDrawer
                open={true}
                onOpenChange={() => {}}
                salesId={salesId}
                asPanel
                readOnly
              />
            </div>
          )}
          {/* 오른쪽: 배송관리 상세정보 (상차/하차 변경 기능) */}
          {open && deliveryId && (
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
              <SalesDeliveryDetailDrawer
                open={true}
                onOpenChange={() => {}}
                deliveryId={deliveryId}
                asPanel
                compactFooter
                onSuccess={onSuccess}
              />
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
