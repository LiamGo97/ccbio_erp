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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/schedules/date-picker';
import { Loader2, X, Save } from 'lucide-react';
import { MallDailyStat } from '@/lib/hooks/use-mall-daily-stats';

export type MallDailyStatFormValues = Omit<MallDailyStat, 'id' | 'createdAt' | 'updatedAt'>;

const FIELDS: { key: keyof MallDailyStatFormValues; label: string }[] = [
  { key: 'totalVisitors', label: '총 방문자수' },
  { key: 'visits', label: '방문횟수' },
  { key: 'newVisitors', label: '신규방문자' },
  { key: 'returningVisitors', label: '재방문자' },
  { key: 'pageViews', label: '총 페이지 뷰' },
  { key: 'appInstalls', label: '어플설치' },
  { key: 'memberSignups', label: '회원가입' },
  { key: 'salesCount', label: '판매' },
];

const defaultValues: MallDailyStatFormValues = {
  statDate: '',
  totalVisitors: 0,
  visits: 0,
  newVisitors: 0,
  returningVisitors: 0,
  pageViews: 0,
  appInstalls: 0,
  memberSignups: 0,
  salesCount: 0,
};

interface MallDailyStatFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 외부 클릭으로 닫지 않고, 닫기 버튼/취소 시에만 호출 */
  onClose: () => void;
  initialData?: MallDailyStat | null;
  mode: 'create' | 'edit';
  onSubmit: (data: MallDailyStatFormValues) => Promise<void>;
  isSubmitting?: boolean;
}

export function MallDailyStatFormDrawer({
  open,
  onOpenChange,
  onClose,
  initialData,
  mode,
  onSubmit,
  isSubmitting,
}: MallDailyStatFormDrawerProps) {
  const [form, setForm] = React.useState<MallDailyStatFormValues>(defaultValues);

  React.useEffect(() => {
    if (open) {
      const today = new Date().toISOString().slice(0, 10);
      if (initialData) {
        setForm({
          statDate: initialData.statDate,
          totalVisitors: initialData.totalVisitors,
          visits: initialData.visits,
          newVisitors: initialData.newVisitors,
          returningVisitors: initialData.returningVisitors,
          pageViews: initialData.pageViews,
          appInstalls: initialData.appInstalls,
          memberSignups: initialData.memberSignups,
          salesCount: initialData.salesCount,
        });
      } else {
        setForm({ ...defaultValues, statDate: today });
      }
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const safe: MallDailyStatFormValues = {
      ...form,
      totalVisitors: Number(form.totalVisitors) || 0,
      visits: Number(form.visits) || 0,
      newVisitors: Number(form.newVisitors) || 0,
      returningVisitors: Number(form.returningVisitors) || 0,
      pageViews: Number(form.pageViews) || 0,
      appInstalls: Number(form.appInstalls) || 0,
      memberSignups: Number(form.memberSignups) || 0,
      salesCount: Number(form.salesCount) || 0,
    };
    await onSubmit(safe);
    onOpenChange(false);
    onClose();
  };

  const update = (key: keyof MallDailyStatFormValues, value: number | string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next === true) onOpenChange(true);
        // 외부 클릭 시 닫지 않음 — onClose는 닫기 버튼/취소에서만 호출
      }}
      direction="right"
    >
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
            <DrawerTitle>
              {mode === 'create' ? '일별 데이터 추가' : '일별 데이터 수정'}
            </DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '날짜와 8가지 지표를 입력하세요.'
                  : '일별 통계 데이터를 수정하세요.'}
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
            {/* 통계일: 한 줄 전체 */}
            <div className="space-y-2">
              <Label>통계일</Label>
              <DatePicker
                value={form.statDate || undefined}
                onChange={(v) => update('statDate', v ?? '')}
                placeholder="날짜 선택"
                disabled={mode === 'edit'}
              />
            </div>
            {/* 나머지 8개: 한 줄에 2개씩 */}
            <div className="grid grid-cols-2 gap-4">
              {FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    type="number"
                    value={form[key] as number}
                    onChange={(e) => {
                      const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                      update(key, Number.isNaN(v) ? 0 : v);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <DrawerFooter className="shrink-0 border-t">
            <div className="flex items-center justify-end gap-2 w-full">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="mr-1.5 h-4 w-4" />
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-4 w-4" />
                    저장
                  </>
                )}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
