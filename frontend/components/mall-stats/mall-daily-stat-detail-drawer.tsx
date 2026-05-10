'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, Edit, Trash2 } from 'lucide-react';
import { MallDailyStat } from '@/lib/hooks/use-mall-daily-stats';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

const FIELDS: { key: keyof MallDailyStat; label: string }[] = [
  { key: 'statDate', label: '통계일' },
  { key: 'totalVisitors', label: '총 방문자수' },
  { key: 'visits', label: '방문횟수' },
  { key: 'newVisitors', label: '신규방문자' },
  { key: 'returningVisitors', label: '재방문자' },
  { key: 'pageViews', label: '총 페이지 뷰' },
  { key: 'appInstalls', label: '어플설치' },
  { key: 'memberSignups', label: '회원가입' },
  { key: 'salesCount', label: '판매' },
];

function formatNum(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

interface MallDailyStatDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  row: MallDailyStat | null;
  onEdit: () => void;
  onDelete: () => void;
}

export function MallDailyStatDetailDrawer({
  open,
  onOpenChange,
  onClose,
  row,
  onEdit,
  onDelete,
}: MallDailyStatDetailDrawerProps) {
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next === true) onOpenChange(true);
    },
    [onOpenChange],
  );

  const displayValue = (key: keyof MallDailyStat, value: unknown): string => {
    if (key === 'statDate' && typeof value === 'string') {
      try {
        return format(parseISO(value), 'yyyy년 M월 d일 (EEEE)', { locale: ko });
      } catch {
        return value;
      }
    }
    if (typeof value === 'number') return formatNum(value);
    return value != null ? String(value) : '-';
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} direction="right">
      <DrawerContent
        className="flex h-full flex-col"
        style={{
          width: '520px',
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      >
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>일별 데이터 상세</DrawerTitle>
              <DrawerDescription>
                해당 날짜의 통계를 확인하고 수정·삭제할 수 있습니다.
              </DrawerDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="닫기"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {row ? (
            <div className="space-y-4">
              {/* 통계일: 한 줄 전체 */}
              <div className="space-y-1">
                <Label className="text-sm font-medium text-muted-foreground">통계일</Label>
                <p className="mt-1 text-sm">{displayValue('statDate', row.statDate)}</p>
              </div>
              {/* 나머지 8개: 한 줄에 2개씩 */}
              <div className="grid grid-cols-2 gap-4">
                {FIELDS.filter((f) => f.key !== 'statDate').map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-sm font-medium text-muted-foreground">{label}</Label>
                    <p className="mt-1 text-sm">{displayValue(key, row[key])}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">데이터를 불러오는 중이거나 없습니다.</p>
          )}
        </div>

        {row && (
          <DrawerFooter className="shrink-0 border-t">
            <div className="flex items-center justify-end gap-2 w-full">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
              <Button type="button" variant="destructive" onClick={onDelete}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                삭제
              </Button>
              <Button type="button" onClick={onEdit}>
                <Edit className="mr-1.5 h-4 w-4" />
                수정
              </Button>
            </div>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
