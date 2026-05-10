'use client';

import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, X, Edit } from 'lucide-react';
import {
  useReceivableWarningConfigs,
  ReceivableWarningConfig,
} from '@/lib/hooks/use-receivable-warning-configs';
import { useIsMobile } from '@/hooks/use-mobile';

interface ReceivableWarningConfigDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configId?: number | null;
  onEditDrawerOpen?: (configId: number) => void;
  onSuccess?: () => void;
}

const getWarningLevelName = (level: string) => {
  const map: Record<string, string> = {
    WARNING_1ST: '1차 경고',
    WARNING_2ND: '2차 경고',
    WARNING_3RD: '3차 경고',
    MALICIOUS: '악성 채권',
  };
  return map[level] || level;
};

const getWarningLevelBadge = (level: string) => {
  const normalized = level.trim().toUpperCase();
  if (normalized === 'WARNING_1ST') {
    return (
      <Badge variant="outline" className="border-yellow-500 bg-yellow-50 text-yellow-700 dark:border-yellow-400 dark:bg-yellow-950/30 dark:text-yellow-300">
        {getWarningLevelName(level)}
      </Badge>
    );
  }
  if (normalized === 'WARNING_2ND') {
    return (
      <Badge variant="outline" className="border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/30 dark:text-orange-300">
        {getWarningLevelName(level)}
      </Badge>
    );
  }
  if (normalized === 'WARNING_3RD') {
    return (
      <Badge variant="outline" className="border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300">
        {getWarningLevelName(level)}
      </Badge>
    );
  }
  if (normalized === 'MALICIOUS') {
    return (
      <Badge variant="outline" className="border-red-600 bg-red-100 text-red-800 dark:border-red-500 dark:bg-red-950/50 dark:text-red-200">
        {getWarningLevelName(level)}
      </Badge>
    );
  }
  return <Badge variant="outline">{getWarningLevelName(level)}</Badge>;
};

export function ReceivableWarningConfigDetailDrawer({
  open,
  onOpenChange,
  configId,
  onEditDrawerOpen,
  onSuccess,
}: ReceivableWarningConfigDetailDrawerProps) {
  const isMobile = useIsMobile();
  const { data: configs = [], refetch } = useReceivableWarningConfigs();

  const config = React.useMemo(() => {
    if (!configId) return null;
    return configs.find((c) => c.id === configId) || null;
  }, [configs, configId]);

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && configId) {
      refetch();
    }
  }, [open, configId, refetch]);

  // 텍스트 선택을 위한 핸들러
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      e.stopPropagation();
    }
  }, []);

  // 더블클릭으로 텍스트 선택을 허용하기 위한 핸들러
  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    e.stopPropagation();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange]);

  if (!config) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
        <DrawerContent
          className="h-full"
          style={{
            width: isMobile ? '100%' : '900px',
            maxWidth: '90vw',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleDoubleClick}
        >
          <DrawerHeader className="border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <DrawerTitle>채권 경고 설정</DrawerTitle>
                <DrawerDescription>설정 정보를 불러오는 중...</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" dismissible={false}>
      <DrawerContent
        className="h-full"
        style={{
          width: isMobile ? '100%' : '900px',
          maxWidth: '90vw',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      >
        <DrawerHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3">
                <DrawerTitle>채권 경고 설정</DrawerTitle>
                {getWarningLevelBadge(config.warningLevel)}
              </div>
              <DrawerDescription>
                {getWarningLevelName(config.warningLevel)} 설정을 관리합니다.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
            {/* 기본 정보 */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">기본 정보</h3>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="warningLevel">경고 단계</Label>
                  <div>{getWarningLevelBadge(config.warningLevel)}</div>
                  <p className="text-xs text-muted-foreground">경고 단계는 변경할 수 없습니다.</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="daysThreshold">경과일 기준 (일)</Label>
                  <div className="text-sm font-medium py-2">{config.daysThreshold}일</div>
                  <p className="text-xs text-muted-foreground">
                    거래명세서 발행일로부터 경과한 일수
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="order">정렬 순서</Label>
                  <div className="text-sm font-medium py-2">{config.order}</div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">설명</Label>
                  <div className="text-sm text-muted-foreground py-2">
                    {config.description || '-'}
                  </div>
                </div>
              </div>
            </section>

            {/* SMS 설정 */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">SMS 발송 설정</h3>
              <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="smsEnabled">SMS 발송</Label>
                      <p className="text-xs text-muted-foreground">SMS 발송 여부</p>
                    </div>
                    <Badge variant={config.smsEnabled ? 'default' : 'secondary'}>
                      {config.smsEnabled ? '사용' : '미사용'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="smsDaily">매일 발송</Label>
                      <p className="text-xs text-muted-foreground">
                        매일 발송 여부 (비활성 시 해당 단계에서 한 번만 발송)
                      </p>
                    </div>
                    <Badge variant={config.smsDaily ? 'default' : 'secondary'}>
                      {config.smsDaily ? '예' : '아니오'}
                    </Badge>
                  </div>

                {config.smsTemplateType && (
                  <div className="grid gap-2">
                    <Label htmlFor="smsTemplateType">SMS 템플릿 타입</Label>
                    <div className="text-sm text-muted-foreground py-2">
                      {config.smsTemplateType}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* 상태 설정 */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">상태 설정</h3>
              <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">활성화</Label>
                      <p className="text-xs text-muted-foreground">이 설정의 활성화 여부</p>
                    </div>
                    <Badge variant={config.isActive ? 'default' : 'secondary'}>
                      {config.isActive ? '활성' : '비활성'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="configType">설정 유형</Label>
                      <p className="text-xs text-muted-foreground">사용자 설정 또는 전역 설정</p>
                    </div>
                    <Badge variant={config.userId ? 'default' : 'outline'}>
                      {config.userId ? '사용자 설정' : '전역 설정'}
                    </Badge>
                  </div>
              </div>
            </section>

            {/* 시스템 정보 */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">시스템 정보</h3>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">생성일</span>
                  <span>{new Date(config.createdAt).toLocaleString('ko-KR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">수정일</span>
                  <span>{new Date(config.updatedAt).toLocaleString('ko-KR')}</span>
                </div>
              </div>
            </section>
            </div>
          </ScrollArea>
        </div>

        <DrawerFooter className="border-t">
          <div className="flex justify-end gap-2">
            <Button 
              variant="default" 
              onClick={() => {
                if (config && onEditDrawerOpen) {
                  onEditDrawerOpen(config.id);
                  // onOpenChange는 onEditDrawerOpen에서 처리하도록 함
                }
              }}
            >
              <Edit className="mr-1.5 h-4 w-4" />
              수정
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
