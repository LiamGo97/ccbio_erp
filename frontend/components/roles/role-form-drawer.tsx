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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateRole, useUpdateRole, Role } from '@/lib/hooks/use-roles';
import { Loader2, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface RoleFormData {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
}

interface RoleFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
  mode: 'create' | 'edit';
}

export function RoleFormDrawer({
  open,
  onOpenChange,
  role,
  mode,
}: RoleFormDrawerProps) {
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RoleFormData>({
    defaultValues: {
      name: '',
      code: '',
      description: '',
      isActive: true,
    },
  });

  const isActive = watch('isActive');

  React.useEffect(() => {
    if (!open) {
      return;
    }
    
    if (mode === 'edit' && role) {
      reset({
        name: role.name,
        code: role.code,
        description: role.description || '',
        isActive: role.isActive !== false,
      });
    } else {
      reset({
        name: '',
        code: '',
        description: '',
        isActive: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, role?.id]);

  const onSubmit = async (data: RoleFormData) => {
    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        await createRole.mutateAsync({
          name: data.name,
          code: data.code,
          description: data.description || undefined,
          isActive: data.isActive,
        });
        toast({
          title: '역할이 추가되었습니다.',
          description: `${data.name} (${data.code}) 역할을 생성했습니다.`,
        });
      } else if (mode === 'edit' && role) {
        await updateRole.mutateAsync({
          id: role.id,
          name: data.name,
          code: data.code,
          description: data.description || undefined,
          isActive: data.isActive,
        });
        toast({
          title: '역할이 수정되었습니다.',
          description: `${data.name} (${data.code}) 역할 정보를 업데이트했습니다.`,
        });
      }
      onOpenChange(false);
      reset();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        '작업 중 오류가 발생했습니다.';
      toast({
        title: '역할 저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full">
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DrawerTitle>
                {mode === 'create' ? '역할 추가' : '역할 수정'}
              </DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 역할을 추가합니다.'
                  : '역할 정보를 수정합니다.'}
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">
                역할 코드 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="code"
                type="text"
                size="sm"
                placeholder="ROLE_SYSTEM"
                {...register('code', {
                  required: '역할 코드를 입력해주세요.',
                  pattern: {
                    value: /^ROLE_[A-Z_]+$/,
                    message: '역할 코드는 ROLE_로 시작해야 합니다. (예: ROLE_SYSTEM)',
                  },
                })}
                disabled={mode === 'edit'}
                className={errors.code ? 'border-destructive' : ''}
              />
              {errors.code && (
                <p className="text-sm text-destructive">{errors.code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                역할 이름 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                size="sm"
                placeholder="시스템 관리자"
                {...register('name', {
                  required: '역할 이름을 입력해주세요.',
                })}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명</Label>
              <Input
                id="description"
                type="text"
                size="sm"
                placeholder="역할에 대한 설명을 입력하세요"
                {...register('description')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="isActive">상태</Label>
              <Select
                value={isActive ? 'true' : 'false'}
                onValueChange={(value) => setValue('isActive', value === 'true')}
              >
                <SelectTrigger id="isActive" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">활성</SelectItem>
                  <SelectItem value="false">비활성</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DrawerFooter className="border-t">
            <div className="flex gap-2 justify-end">
              <DrawerClose asChild>
                <Button type="button" variant="outline" size="sm" disabled={isSubmitting}>
                  취소
                </Button>
              </DrawerClose>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'create' ? '추가' : '수정'}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

