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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, X, Save } from 'lucide-react';
import {
  useReceivableWarningConfigs,
  useUpdateReceivableWarningConfig,
  useCreateReceivableWarningConfig,
  useDeleteReceivableWarningConfig,
  ReceivableWarningConfig,
  UpdateReceivableWarningConfigDto,
  CreateReceivableWarningConfigDto,
} from '@/lib/hooks/use-receivable-warning-configs';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/components/ui/use-toast';
import { auth, User } from '@/lib/auth';

interface ReceivableWarningConfigFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configId?: number | null;
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

export function ReceivableWarningConfigFormDrawer({
  open,
  onOpenChange,
  configId,
  onSuccess,
}: ReceivableWarningConfigFormDrawerProps) {
  const isMobile = useIsMobile();
  const [user, setUser] = React.useState<User | null>(null);
  const { data: configs = [], isLoading, refetch } = useReceivableWarningConfigs();
  const updateMutation = useUpdateReceivableWarningConfig();
  const createMutation = useCreateReceivableWarningConfig();
  const deleteMutation = useDeleteReceivableWarningConfig();

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const config = React.useMemo(() => {
    if (!configId) return null;
    const found = configs.find((c) => c.id === configId);
    if (!found && configs.length > 0) {
      console.warn('[ReceivableWarningConfigFormDrawer] Config not found:', { configId, configs });
    }
    return found || null;
  }, [configs, configId]);

  const [formData, setFormData] = React.useState<UpdateReceivableWarningConfigDto>({
    daysThreshold: 0,
    smsEnabled: true,
    smsDaily: false,
    smsTemplateType: null,
    description: null,
    order: 0,
    isActive: true,
  });

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && configId) {
      refetch();
    }
  }, [open, configId, refetch]);

  // config가 변경되면 formData 초기화
  React.useEffect(() => {
    if (config) {
      setFormData({
        daysThreshold: config.daysThreshold,
        smsEnabled: config.smsEnabled,
        smsDaily: config.smsDaily,
        smsTemplateType: config.smsTemplateType ?? null,
        description: config.description ?? null,
        order: config.order,
        isActive: config.isActive,
      });
    }
  }, [config]);

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

  const handleSave = async () => {
    if (!config) return;

    try {
      await updateMutation.mutateAsync({
        id: config.id,
        dto: formData,
      });
      toast({
        title: '저장 완료',
        description: '채권 경고 설정이 수정되었습니다.',
      });
      refetch();
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '저장 실패',
        description: error instanceof Error ? error.message : '채권 경고 설정 수정에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateUserConfig = async () => {
    if (!config || !user) return;

    try {
      const createDto: CreateReceivableWarningConfigDto = {
        warningLevel: config.warningLevel,
        daysThreshold: formData.daysThreshold,
        smsEnabled: formData.smsEnabled,
        smsDaily: formData.smsDaily,
        smsTemplateType: formData.smsTemplateType,
        description: formData.description,
        order: formData.order,
        isActive: formData.isActive,
        userId: user.id,
      };

      await createMutation.mutateAsync(createDto);
      toast({
        title: '생성 완료',
        description: '사용자별 채권 경고 설정이 생성되었습니다.',
      });
      refetch();
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '생성 실패',
        description: error instanceof Error ? error.message : '사용자별 채권 경고 설정 생성에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUserConfig = async () => {
    if (!config || !config.userId) return;

    if (!confirm('사용자 설정을 삭제하시겠습니까? 전역 설정으로 되돌아갑니다.')) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(config.id);
      toast({
        title: '삭제 완료',
        description: '사용자별 채권 경고 설정이 삭제되었습니다. 전역 설정을 사용합니다.',
      });
      refetch();
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '삭제 실패',
        description: error instanceof Error ? error.message : '사용자별 채권 경고 설정 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  // configId가 없으면 Drawer를 렌더링하지 않음
  if (!configId) {
    return null;
  }

  // 로딩 중이면 로딩 화면 표시
  if (isLoading) {
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
                <DrawerTitle>채권 경고 설정 수정</DrawerTitle>
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

  // 로딩이 완료되었지만 config를 찾을 수 없는 경우
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
                <DrawerTitle>채권 경고 설정 수정</DrawerTitle>
                <DrawerDescription>설정 정보를 찾을 수 없습니다.</DrawerDescription>
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
            <p className="text-sm text-muted-foreground">
              설정 정보를 찾을 수 없습니다. (ID: {configId})
            </p>
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
                <DrawerTitle>채권 경고 설정 수정</DrawerTitle>
                {getWarningLevelBadge(config.warningLevel)}
                <Badge variant={config.userId ? 'default' : 'outline'}>
                  {config.userId ? '사용자 설정' : '전역 설정'}
                </Badge>
              </div>
              <DrawerDescription>
                {getWarningLevelName(config.warningLevel)} 설정을 수정합니다.
                {config.userId ? ' 이 설정은 현재 사용자 전용입니다.' : ' 이 설정은 모든 사용자에게 적용됩니다.'}
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
                <div>
                  <h3 className="text-sm font-semibold text-foreground">기본 정보</h3>
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="warningLevel">경고 단계</Label>
                    <div>{getWarningLevelBadge(config.warningLevel)}</div>
                    <p className="text-xs text-muted-foreground">경고 단계는 변경할 수 없습니다.</p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="daysThreshold">경과일 기준 (일)</Label>
                    <Input
                      id="daysThreshold"
                      type="number"
                      min="0"
                      value={formData.daysThreshold}
                      onChange={(e) =>
                        setFormData({ ...formData, daysThreshold: parseInt(e.target.value, 10) || 0 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      거래명세서 발행일로부터 경과한 일수
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="order">정렬 순서</Label>
                    <Input
                      id="order"
                      type="number"
                      min="0"
                      value={formData.order}
                      onChange={(e) =>
                        setFormData({ ...formData, order: parseInt(e.target.value, 10) || 0 })
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description">설명</Label>
                    <Input
                      id="description"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
                      placeholder="설명을 입력하세요"
                    />
                  </div>
                </div>
              </section>

              {/* SMS 설정 */}
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">SMS 발송 설정</h3>
                </div>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="smsEnabled">SMS 발송</Label>
                      <p className="text-xs text-muted-foreground">SMS 발송 여부</p>
                    </div>
                    <Switch
                      id="smsEnabled"
                      checked={formData.smsEnabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, smsEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="smsDaily">매일 발송</Label>
                      <p className="text-xs text-muted-foreground">
                        매일 발송 여부 (비활성 시 해당 단계에서 한 번만 발송)
                      </p>
                    </div>
                    <Switch
                      id="smsDaily"
                      checked={formData.smsDaily}
                      onCheckedChange={(checked) => setFormData({ ...formData, smsDaily: checked })}
                      disabled={!formData.smsEnabled}
                    />
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
                <div>
                  <h3 className="text-sm font-semibold text-foreground">상태 설정</h3>
                </div>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">활성화</Label>
                      <p className="text-xs text-muted-foreground">이 설정의 활성화 여부</p>
                    </div>
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
        </div>

        <DrawerFooter className="border-t">
          <div className="flex justify-between items-center w-full">
            <div className="flex gap-2">
              {config.userId && (
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteUserConfig}
                  disabled={deleteMutation.isPending || updateMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      삭제 중...
                    </>
                  ) : (
                    '전역 설정 사용'
                  )}
                </Button>
              )}
              {!config.userId && user && (
                <Button 
                  variant="outline" 
                  onClick={handleCreateUserConfig}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      생성 중...
                    </>
                  ) : (
                    '사용자 설정 생성'
                  )}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)} 
                disabled={updateMutation.isPending || createMutation.isPending || deleteMutation.isPending}
              >
                취소
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={updateMutation.isPending || createMutation.isPending || deleteMutation.isPending}
              >
                {updateMutation.isPending ? (
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
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
