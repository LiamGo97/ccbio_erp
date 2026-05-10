'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DispatchUser,
  useCreateDispatchUser,
  useUpdateDispatchUser,
} from '@/lib/hooks/use-dispatch-users';
import { useUsers } from '@/lib/hooks/use-users';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { Loader2, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface DispatchCompanyEmployeeFormData {
  userId: number | '';
  dispatchCompanyId: number | '';
}

interface DispatchCompanyEmployeeFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatchUser?: DispatchUser | null;
  onSubmit?: () => void;
  onCancel?: () => void;
}

export function DispatchCompanyEmployeeFormDrawer({
  open,
  onOpenChange,
  dispatchUser,
  onSubmit,
  onCancel,
}: DispatchCompanyEmployeeFormDrawerProps) {
  const createMutation = useCreateDispatchUser();
  const updateMutation = useUpdateDispatchUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // 사용자 목록 조회 (ROLE_DISPATCH_COMPANY_USER 역할을 가진 사용자만)
  const { data: usersResponse, isLoading: usersLoading } = useUsers({
    roleCode: 'ROLE_DISPATCH_COMPANY_USER',
    status: 'all',
  });
  const users = usersResponse?.data || [];

  // 배차 업체 목록 조회
  const { data: dispatchCompanies = [], isLoading: dispatchCompaniesLoading } =
    useDispatchCompanies({ status: true });

  const {
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<DispatchCompanyEmployeeFormData>({
    defaultValues: {
      userId: '',
      dispatchCompanyId: '',
    },
  });

  const userIdValue = watch('userId');
  const dispatchCompanyIdValue = watch('dispatchCompanyId');

  // open이 true로 변경될 때만 한 번 reset 실행
  const hasInitializedRef = React.useRef<string>('');

  React.useEffect(() => {
    if (!open) {
      hasInitializedRef.current = '';
      return;
    }

    const initKey = dispatchUser?.id ? String(dispatchUser.id) : 'new';
    if (hasInitializedRef.current === initKey) {
      return;
    }

    if (dispatchUser) {
      // 수정 모드
      reset({
        userId: dispatchUser.userId,
        dispatchCompanyId: dispatchUser.dispatchCompanyId,
      });
    } else {
      // 생성 모드
      reset({
        userId: '',
        dispatchCompanyId: '',
      });
    }

    hasInitializedRef.current = initKey;
  }, [open, dispatchUser, reset]);


  const onSubmitInternal = async (data: DispatchCompanyEmployeeFormData) => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      if (dispatchUser) {
        // 수정 - 배차 업체만 변경
        await updateMutation.mutateAsync({
          id: dispatchUser.id,
          data: {
            dispatchCompanyId: data.dispatchCompanyId || undefined,
          },
        });
        toast({
          title: '수정 완료',
          description: '배차 업체를 변경했습니다.',
        });
      } else {
        // 생성
        if (!data.userId || !data.dispatchCompanyId) {
        toast({
          title: '입력 오류',
          description: '사용자와 배차 업체를 선택해주세요.',
        });
          setIsSubmitting(false);
          return;
        }

        // 사용자 정보에서 이름 가져오기
        const selectedUser = users.find((u) => u.id === data.userId);
        const userName = selectedUser?.name || selectedUser?.email || '';

        await createMutation.mutateAsync({
          userId: data.userId,
          dispatchCompanyId: data.dispatchCompanyId,
          name: userName,
        });
        toast({
          title: '추가 완료',
          description: '배차 업체를 연결했습니다.',
        });
      }

      onOpenChange(false);
      onSubmit?.();
    } catch (error: unknown) {
      const message =
        (error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string | string[] } } })?.response?.data
              ?.message
          : null) || '처리 중 오류가 발생했습니다.';
      toast({
        title: dispatchUser ? '수정 실패' : '추가 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DrawerTitle>{dispatchUser ? '배차 업체 직원 수정' : '배차 업체 직원 추가'}</DrawerTitle>
              <DrawerDescription>
                {dispatchUser
                  ? '배차 업체 직원 정보를 수정합니다.'
                  : '새로운 배차 업체 직원을 추가합니다.'}
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

        <form onSubmit={handleSubmit(onSubmitInternal)} className="flex flex-col flex-1">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-6">
              {/* 사용자 선택 */}
              <div className="space-y-2">
                <Label htmlFor="userId">
                  사용자 <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={userIdValue ? userIdValue.toString() : ''}
                  onValueChange={(value) => {
                    setValue('userId', value ? parseInt(value, 10) : '', {
                      shouldValidate: true,
                    });
                  }}
                  disabled={!!dispatchUser || usersLoading}
                >
                  <SelectTrigger id="userId">
                    <SelectValue placeholder={usersLoading ? '로딩 중...' : '사용자 선택'} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {usersLoading
                          ? '로딩 중...'
                          : 'ROLE_DISPATCH_COMPANY_USER 역할을 가진 사용자가 없습니다.'}
                      </div>
                    ) : (
                      users.map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.email} {u.name && `(${u.name})`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.userId && (
                  <p className="text-sm text-red-500">{errors.userId.message}</p>
                )}
              </div>

              {/* 배차 업체 선택 */}
              <div className="space-y-2">
                <Label htmlFor="dispatchCompanyId">
                  배차 업체 <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={dispatchCompanyIdValue ? dispatchCompanyIdValue.toString() : ''}
                  onValueChange={(value) => {
                    setValue('dispatchCompanyId', value ? parseInt(value, 10) : '', {
                      shouldValidate: true,
                    });
                  }}
                  disabled={dispatchCompaniesLoading}
                >
                  <SelectTrigger id="dispatchCompanyId">
                    <SelectValue
                      placeholder={dispatchCompaniesLoading ? '로딩 중...' : '배차 업체 선택'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {dispatchCompanies.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {dispatchCompaniesLoading
                          ? '로딩 중...'
                          : '등록된 배차 업체가 없습니다.'}
                      </div>
                    ) : (
                      dispatchCompanies.map((dc) => (
                        <SelectItem key={dc.id} value={dc.id.toString()}>
                          {dc.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.dispatchCompanyId && (
                  <p className="text-sm text-red-500">{errors.dispatchCompanyId.message}</p>
                )}
              </div>

            </div>
          </div>

          <DrawerFooter>
            <div className="flex gap-2">
              {onCancel ? (
                <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                  취소
                </Button>
              ) : (
                <DrawerClose asChild>
                  <Button type="button" variant="outline" disabled={isSubmitting}>
                    취소
                  </Button>
                </DrawerClose>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {dispatchUser ? '수정' : '추가'}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

