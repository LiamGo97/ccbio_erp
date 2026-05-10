'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';

export interface ReturnRegisterItemOption {
  id: string;
  label: string;
}

export interface ReturnRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesId: string | null;
  itemOptions: ReturnRegisterItemOption[];
  warehouses: Array<{ id: number; name: string }>;
}

/**
 * 반품 등록 다이얼로그 (UI만, DB/백엔드 연동 없음 - 체크용)
 */
export function ReturnRegisterDialog({
  open,
  onOpenChange,
  salesId,
  itemOptions,
  warehouses,
}: ReturnRegisterDialogProps) {
  const [selectedItemId, setSelectedItemId] = React.useState<string>('');
  const [bales, setBales] = React.useState<string>('');
  const [weightKg, setWeightKg] = React.useState<string>('');
  const [warehouseId, setWarehouseId] = React.useState<string>('');
  const [returnDate, setReturnDate] = React.useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [reason, setReason] = React.useState<string>('');

  React.useEffect(() => {
    if (open) {
      setSelectedItemId(itemOptions[0]?.id ?? '');
      setBales('');
      setWeightKg('');
      setWarehouseId('');
      setReturnDate(new Date().toISOString().slice(0, 10));
      setReason('');
    }
  }, [open, itemOptions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: 'UI 체크용',
      description: '반품 등록은 아직 저장되지 않습니다. (DB/백엔드 미연동)',
      variant: 'default',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>반품 등록</DialogTitle>
          <DialogDescription>
            판매 항목에 대한 반품을 등록합니다. (현재 UI 체크용, 저장되지 않음)
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {salesId && (
            <div className="text-xs text-muted-foreground">
              판매 ID: {salesId}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="return-item">판매 항목</Label>
            <Select
              value={selectedItemId}
              onValueChange={setSelectedItemId}
              required
            >
              <SelectTrigger id="return-item">
                <SelectValue placeholder="항목 선택" />
              </SelectTrigger>
              <SelectContent>
                {itemOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="return-bales">반품 베일</Label>
              <Input
                id="return-bales"
                type="number"
                min={0}
                step={0.01}
                placeholder="0"
                value={bales}
                onChange={(e) => setBales(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="return-weight">반품 중량 (kg)</Label>
              <Input
                id="return-weight"
                type="number"
                min={0}
                step={0.01}
                placeholder="0"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="return-warehouse">반품 입고 창고</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger id="return-warehouse">
                <SelectValue placeholder="창고 선택" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="return-date">반품(입고) 일자</Label>
            <Input
              id="return-date"
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="return-reason">사유 (선택)</Label>
            <Textarea
              id="return-reason"
              placeholder="반품 사유"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit">등록 (UI 체크)</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
