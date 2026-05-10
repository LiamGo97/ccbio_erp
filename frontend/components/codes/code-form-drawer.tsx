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
import { Textarea } from '@/components/ui/textarea';
import { Code, useCodesByCategory, useCreateCode, useUpdateCode } from '@/lib/hooks/use-codes';
import { Loader2, X, XCircle, Trash2, Plus, Edit } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CodeFormData {
  group: string;
  name: string;
  value: string;
  order: number;
  aliases?: string;
  parentId?: number | null;
}

interface CodeFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code?: Code | null;
  mode: 'create' | 'edit';
  categoryCode: string;
  onDelete?: (code: Code) => void;
}

export function CodeFormDrawer({
  open,
  onOpenChange,
  code,
  mode,
  categoryCode,
  onDelete,
}: CodeFormDrawerProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { data: productCategories } = useCodesByCategory('PRODUCT_CATEGORY');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
    watch,
  } = useForm<CodeFormData>({
    defaultValues: {
      group: categoryCode,
      name: '',
      value: '',
      order: 0,
      aliases: '',
      parentId: null,
    },
  });
  const parentIdValue = watch('parentId');

  const createCodeMutation = useCreateCode();
  const updateCodeMutation = useUpdateCode();

  React.useEffect(() => {
    if (!open) {
      return;
    }
    
    if (mode === 'edit' && code) {
      reset({
        group: code.group,
        name: code.name,
        value: code.value ?? '',
        order: code.order,
        aliases: code.aliases ?? '',
        parentId: code.parentId ?? null,
      });
    } else {
      reset({
        group: categoryCode,
        name: '',
        value: '',
        order: 0,
        aliases: '',
        parentId: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, code?.id, categoryCode]);

  const onSubmit = async (data: CodeFormData) => {
    setIsSubmitting(true);
    try {
      if (categoryCode === 'PRODUCT' && (data.parentId === null || data.parentId === undefined)) {
        setError('parentId', { type: 'required', message: '제품 카테고리를 선택해주세요.' });
        setIsSubmitting(false);
        return;
      }
      if (categoryCode !== 'PRODUCT') {
        data.parentId = undefined;
      }
      const trimmedAliases = data.aliases?.trim() ?? '';
      if (mode === 'create') {
        await createCodeMutation.mutateAsync({
          group: categoryCode,
          name: data.name,
          value: data.value,
          order: data.order,
          parentId: categoryCode === 'PRODUCT' ? data.parentId ?? undefined : undefined,
          aliases: trimmedAliases.length ? trimmedAliases : undefined,
        });
        toast({
          title: '코드가 추가되었습니다.',
          description: `${data.name} (${data.value}) 항목을 등록했습니다.`,
        });
      } else if (code) {
        await updateCodeMutation.mutateAsync({
          id: code.id,
          data: {
            name: data.name,
            value: data.value,
            order: data.order,
            parentId: categoryCode === 'PRODUCT' ? data.parentId ?? null : undefined,
            aliases: trimmedAliases,
          },
        });
        toast({
          title: '코드가 수정되었습니다.',
          description: `${data.name} (${data.value}) 항목을 업데이트했습니다.`,
        });
      }
      onOpenChange(false);
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ??
        (error as Error)?.message ??
        '코드를 저장하는 중 오류가 발생했습니다.';
      toast({
        title: '코드 저장 실패',
        description: Array.isArray(message) ? message.join(', ') : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '500px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle>{mode === 'create' ? '코드 추가' : '코드 수정'}</DrawerTitle>
              <DrawerDescription>
                {mode === 'create' ? '새로운 코드를 추가합니다.' : '코드 정보를 수정합니다.'}
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

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">카테고리</Label>
                <Input
                  id="code"
                  size="sm"
                  value={categoryCode}
                  disabled
                  className="bg-muted"
                />
              </div>

              {categoryCode === 'PRODUCT' && (
                <div className="space-y-2">
                  <Label htmlFor="parentId">
                    제품 카테고리 <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={parentIdValue ? parentIdValue.toString() : ''}
                    onValueChange={(value) => {
                      const parsed = value ? Number(value) : null;
                      setValue('parentId', parsed, { shouldDirty: true, shouldValidate: true });
                      clearErrors('parentId');
                    }}
                  >
                    <SelectTrigger id="parentId">
                      <SelectValue placeholder="제품 카테고리를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {productCategories?.map((category) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.parentId && (
                    <p className="text-sm text-destructive">{errors.parentId.message}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">
                  이름 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  size="sm"
                  {...register('name', { required: '이름을 입력해주세요.' })}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="value">
                  값 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="value"
                  size="sm"
                  {...register('value', { required: '값을 입력해주세요.' })}
                />
                {errors.value && (
                  <p className="text-sm text-destructive">{errors.value.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="order">
                  정렬 순서 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="order"
                  type="number"
                  size="sm"
                  {...register('order', {
                    required: '정렬 순서를 입력해주세요.',
                    valueAsNumber: true,
                    min: { value: 0, message: '0 이상의 숫자를 입력해주세요.' },
                  })}
                />
                {errors.order && (
                  <p className="text-sm text-destructive">{errors.order.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="aliases">별칭 (쉼표 또는 줄바꿈으로 구분)</Label>
                <Textarea
                  id="aliases"
                  rows={3}
                  {...register('aliases')}
                  placeholder="예: BIO AGRI FORAGE SRL, BAF"
                />
              </div>
            </div>
          </div>

          <DrawerFooter className="border-t border-border">
            <div className="flex gap-2">
              {mode === 'edit' && code && onDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => onDelete(code)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </Button>
              ) : (
                <DrawerClose asChild>
                  <Button type="button" variant="outline" size="sm" disabled={isSubmitting}>
                    <XCircle className="mr-2 h-4 w-4" />
                    취소
                  </Button>
                </DrawerClose>
              )}
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : mode === 'create' ? (
                  <Plus className="mr-2 h-4 w-4" />
                ) : (
                  <Edit className="mr-2 h-4 w-4" />
                )}
                {mode === 'create' ? '추가' : '수정'}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}


