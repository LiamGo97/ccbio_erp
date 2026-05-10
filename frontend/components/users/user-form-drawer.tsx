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
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateUser, useUpdateUser } from '@/lib/hooks/use-users';
import { useRoles } from '@/lib/hooks/use-roles';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useCreateDispatchUser, useUpdateDispatchUser, useDispatchUser, useDispatchUsers, type GetDispatchUsersParams } from '@/lib/hooks/use-dispatch-users';
import { User } from '@/lib/auth';
import { Loader2, X, Save, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface UserFormData {
  email: string;
  name: string;
  phone?: string;
  password?: string;
  passwordConfirm?: string;
  isActive: boolean;
  roleIds: number[];
  dispatchCompanyId?: number;
  warehouseId?: number;
}

interface UserFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
  mode: 'create' | 'edit';
}

export function UserFormDrawer({
  open,
  onOpenChange,
  user,
  mode,
}: UserFormDrawerProps) {
  const queryClient = useQueryClient();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const createDispatchUser = useCreateDispatchUser();
  const updateDispatchUser = useUpdateDispatchUser();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  // 수정 모드일 때 사용자의 기존 배차 업체 연결 조회
  const { data: existingDispatchUsers = [], isLoading: isLoadingDispatchUsers, refetch: refetchDispatchUsers } = useDispatchUsers(
    mode === 'edit' && user?.id ? { userId: user.id } : undefined
  );
  const existingDispatchUser = React.useMemo(() => {
    console.log('[USER_FORM] ========== 배차 업체 연결 조회 시작 ==========');
    console.log('[USER_FORM] 사용자 ID:', user?.id);
    console.log('[USER_FORM] 조회된 배차 업체 직원 목록:', existingDispatchUsers);
    console.log('[USER_FORM] 목록 개수:', existingDispatchUsers.length);
    console.log('[USER_FORM] 로딩 중:', isLoadingDispatchUsers);
    
    if (!user?.id) {
      console.log('[USER_FORM] 사용자 ID가 없음 - null 반환');
      return null;
    }
    
    const found = existingDispatchUsers.find((du) => du.userId === user.id);
    console.log('[USER_FORM] 찾은 배차 업체 연결:', found);
    if (found) {
      console.log('[USER_FORM]   - ID: ${found.id}');
      console.log('[USER_FORM]   - userId: ${found.userId}');
      console.log('[USER_FORM]   - dispatchCompanyId: ${found.dispatchCompanyId}');
      console.log('[USER_FORM]   - name: ${found.name}');
    } else {
      console.log('[USER_FORM] 배차 업체 연결을 찾을 수 없음');
    }
    console.log('[USER_FORM] ========== 배차 업체 연결 조회 완료 ==========');
    return found;
  }, [existingDispatchUsers, user?.id, isLoadingDispatchUsers]);
  
  // 역할 목록 조회 (활성 역할만)
  const { data: rolesData } = useRoles({ status: 'active' });
  const roles = Array.isArray(rolesData) ? rolesData : rolesData?.data || [];
  
  // 배차 업체 목록 조회
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  
  // 창고 목록 조회
  const { data: warehouses = [] } = useWarehouses({ status: true });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<UserFormData>({
    defaultValues: {
      email: '',
      name: '',
      phone: '',
      password: '',
      passwordConfirm: '',
      isActive: true,
      roleIds: [],
      dispatchCompanyId: undefined,
      warehouseId: undefined,
    },
  });

  const isActive = watch('isActive');
  const password = watch('password');
  const roleIdsValue = watch('roleIds');
  const roleIds = Array.isArray(roleIdsValue) ? roleIdsValue : [];
  const dispatchCompanyId = watch('dispatchCompanyId');
  const warehouseId = watch('warehouseId');
  
  // 선택된 역할 코드 확인
  const selectedRoleCodes = React.useMemo(() => {
    return roles
      .filter((role) => roleIds.includes(role.id))
      .map((role) => role.code);
  }, [roles, roleIds]);
  
  const hasDispatchCompanyRole = selectedRoleCodes.includes('ROLE_DISPATCH_COMPANY_USER');
  const hasWarehouseCompanyRole = selectedRoleCodes.includes('ROLE_WAREHOUSE_COMPANY_USER');

  // 전화번호 포맷터 (한국형, 고객 관리와 동일)
  const formatPhone = React.useCallback((input: string): string => {
    if (!input) return '';
    const digits = input.replace(/[^0-9]/g, '');
    // 서울(02) 국번 처리
    if (digits.startsWith('02')) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
    // 휴대폰/일반지역번호
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }, []);

  // drawer가 열릴 때마다 배차 업체 정보 강제 refetch
  React.useEffect(() => {
    if (open && mode === 'edit' && user?.id) {
      console.log('[USER_FORM] Drawer 열림 - 배차 업체 정보 강제 refetch');
      refetchDispatchUsers();
    }
  }, [open, mode, user?.id, refetchDispatchUsers]);

  // open이 true로 변경될 때만 한 번 reset 실행 (ref로 한 번만 실행 보장)
  const hasInitializedRef = React.useRef<string>('');
  const lastDispatchCompanyIdRef = React.useRef<number | undefined>(undefined);
  
  React.useEffect(() => {
    if (!open) {
      // drawer가 닫히면 초기화 플래그 리셋
      hasInitializedRef.current = '';
      lastDispatchCompanyIdRef.current = undefined;
      return;
    }

    // 이미 초기화된 경우 스킵 (user?.id와 mode 조합으로 판단)
    // 단, 배차 업체 ID가 변경된 경우에는 다시 초기화
    const initKey = `${mode}-${user?.id || 'new'}`;
    const currentDispatchCompanyId = existingDispatchUser?.dispatchCompanyId;
    const shouldReinitialize = hasInitializedRef.current !== initKey || 
      (mode === 'edit' && lastDispatchCompanyIdRef.current !== currentDispatchCompanyId);

    if (!shouldReinitialize) {
      return;
    }

    hasInitializedRef.current = initKey;
    lastDispatchCompanyIdRef.current = currentDispatchCompanyId;

    if (mode === 'edit' && user) {
      const roleIds = user.roles && Array.isArray(user.roles)
        ? user.roles.map((r) => r.id)
        : [];
      const dispatchCompanyId = existingDispatchUser?.dispatchCompanyId || undefined;
      console.log('[USER_FORM] 폼 초기화 - 사용자 ID:', user.id);
      console.log('[USER_FORM] 기존 배차 업체 연결:', existingDispatchUser);
      console.log('[USER_FORM] 설정할 배차 업체 ID:', dispatchCompanyId);
      reset({
        email: user.email || '',
        name: user.name || '',
        phone: formatPhone(user.phone || ''),
        password: '',
        passwordConfirm: '',
        isActive: user.isActive !== false,
        roleIds,
        dispatchCompanyId,
        warehouseId: user.warehouseId || undefined,
      });
    } else {
      reset({
        email: '',
        name: '',
        phone: '',
        password: '',
        passwordConfirm: '',
        isActive: true,
        roleIds: [],
        dispatchCompanyId: undefined,
        warehouseId: undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, user?.id, existingDispatchUser?.dispatchCompanyId, formatPhone]);

  // existingDispatchUser가 변경되면 폼의 dispatchCompanyId 업데이트
  React.useEffect(() => {
    if (mode === 'edit' && user && existingDispatchUser && open) {
      const newDispatchCompanyId = existingDispatchUser.dispatchCompanyId;
      const currentDispatchCompanyId = watch('dispatchCompanyId');
      if (newDispatchCompanyId !== currentDispatchCompanyId) {
        console.log('[USER_FORM] 배차 업체 ID 업데이트 - 기존:', currentDispatchCompanyId, '새로운:', newDispatchCompanyId);
        setValue('dispatchCompanyId', newDispatchCompanyId, { shouldDirty: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingDispatchUser?.dispatchCompanyId, mode, user?.id, open]);

  const handleRoleToggle = React.useCallback((roleId: number) => {
    const currentRoleIds = Array.isArray(roleIds) ? roleIds : [];
    const newRoleIds = currentRoleIds.includes(roleId)
      ? currentRoleIds.filter(id => id !== roleId)
      : [...currentRoleIds, roleId];
    setValue('roleIds', newRoleIds, { shouldDirty: true });
  }, [roleIds, setValue]);

  const onSubmit = async (data: UserFormData) => {
    setIsSubmitting(true);
    try {
      let createdOrUpdatedUserId: number;

      if (mode === 'create') {
        // 구글 로그인 사용자가 아닌 경우에만 비밀번호 필수
        if (!user?.googleId && !data.password) {
          toast({
            title: '비밀번호가 필요합니다.',
            description: '비밀번호를 입력한 후 다시 시도해 주세요.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }

        // 배차 업체 역할 선택 시 배차 업체 필수
        if (hasDispatchCompanyRole && !data.dispatchCompanyId) {
          toast({
            title: '배차 업체를 선택해주세요.',
            description: '배차 업체 사용자 역할을 선택한 경우 배차 업체를 선택해야 합니다.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }

        // 창고 업체 역할 선택 시 창고 필수
        if (hasWarehouseCompanyRole && !data.warehouseId) {
          toast({
            title: '창고를 선택해주세요.',
            description: '창고 업체 사용자 역할을 선택한 경우 창고를 선택해야 합니다.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }

        const createdUser = await createUser.mutateAsync({
          email: data.email,
          ...(data.password && { password: data.password }),
          name: data.name || undefined,
          phone: data.phone || undefined,
          isActive: data.isActive,
          roleIds: data.roleIds && data.roleIds.length > 0 ? data.roleIds : undefined,
          ...(hasWarehouseCompanyRole && data.warehouseId && { warehouseId: data.warehouseId }),
        });
        createdOrUpdatedUserId = createdUser.id;

        // 배차 업체 연결
        if (hasDispatchCompanyRole && data.dispatchCompanyId) {
          try {
            await createDispatchUser.mutateAsync({
              userId: createdUser.id,
              dispatchCompanyId: data.dispatchCompanyId,
              name: data.name || createdUser.email || '',
            });
          } catch (dispatchError: any) {
            // 배차 업체 연결 실패해도 사용자는 생성되었으므로 경고만 표시
            console.error('배차 업체 연결 실패:', dispatchError);
            toast({
              title: '배차 업체 연결 실패',
              description: '사용자는 생성되었지만 배차 업체 연결에 실패했습니다. 나중에 수정할 수 있습니다.',
              variant: 'destructive',
            });
          }
        }

        toast({
          title: '사용자가 생성되었습니다.',
          description: `${data.email} 계정이 등록되었습니다.`,
        });
      } else {
        console.log('[USER_FORM] 사용자 수정 시작');
        console.log('[USER_FORM] 폼 데이터:', data);
        console.log('[USER_FORM] 기존 사용자:', user);
        console.log('[USER_FORM] 기존 배차 업체 연결:', existingDispatchUser);
        console.log('[USER_FORM] 배차 업체 역할 선택 여부:', hasDispatchCompanyRole);
        console.log('[USER_FORM] 선택된 배차 업체 ID:', data.dispatchCompanyId);
        
        // 구글 로그인 사용자는 비밀번호 변경 불가
        const updateData: any = {
          id: user!.id,
          name: data.name || undefined,
          phone: data.phone || undefined,
          isActive: data.isActive,
          roleIds: data.roleIds,
        };
        // 구글 로그인 사용자가 아니고 비밀번호가 입력된 경우에만 포함
        if (!user?.googleId && data.password) {
          updateData.password = data.password;
        }
        // 창고 업체 역할 선택 시 창고 ID 포함
        if (hasWarehouseCompanyRole) {
          updateData.warehouseId = data.warehouseId || null;
        } else {
          // 창고 업체 역할이 아닌 경우 창고 ID를 null로 설정
          updateData.warehouseId = null;
        }
        console.log('[USER_FORM] 사용자 업데이트 데이터:', updateData);
        const updatedUser = await updateUser.mutateAsync(updateData);
        createdOrUpdatedUserId = updatedUser.id;
        console.log('[USER_FORM] 사용자 업데이트 완료:', updatedUser);

        // 배차 업체 역할 변경 처리
        // 기존 연결이 있고 배차 업체 역할이 선택되어 있고 배차 업체 ID가 있으면 업데이트
        if (existingDispatchUser && hasDispatchCompanyRole && data.dispatchCompanyId) {
          const currentDispatchCompanyId = existingDispatchUser.dispatchCompanyId;
          const newDispatchCompanyId = data.dispatchCompanyId;
          const hasChanged = currentDispatchCompanyId !== newDispatchCompanyId;
          
          // 배차 업체 ID가 변경되었거나, 이름이 변경되었을 때 업데이트
          const currentName = existingDispatchUser.name || user!.name || user!.email || '';
          const newName = data.name || user!.name || user!.email || '';
          const nameChanged = currentName !== newName;
          
          if (hasChanged || nameChanged) {
            console.log('[USER_FORM] 기존 배차 업체 연결 업데이트 시도 - ID:', existingDispatchUser.id, '기존 배차 업체 ID:', currentDispatchCompanyId, '새 배차 업체 ID:', newDispatchCompanyId, '변경 여부:', hasChanged, '이름 변경 여부:', nameChanged);
            try {
              console.log('[USER_FORM] ========== 배차 업체 연결 업데이트 API 호출 시작 ==========');
              console.log('[USER_FORM] 업데이트 요청 데이터:', {
                id: existingDispatchUser.id,
                data: {
                  dispatchCompanyId: newDispatchCompanyId,
                  name: newName,
                },
              });
              
              const updateResult = await updateDispatchUser.mutateAsync({
                id: existingDispatchUser.id,
                data: {
                  dispatchCompanyId: newDispatchCompanyId,
                  name: newName,
                },
              });
              
              console.log('[USER_FORM] 배차 업체 연결 업데이트 API 응답:', updateResult);
              console.log('[USER_FORM] 응답 데이터 - dispatchCompanyId:', updateResult?.dispatchCompanyId);
              console.log('[USER_FORM] ========== 배차 업체 연결 업데이트 API 호출 완료 ==========');
              
              // 배차 업체 정보 다시 불러오기
              console.log('[USER_FORM] 배차 업체 정보 다시 불러오기 시작');
              queryClient.invalidateQueries({ queryKey: ['dispatch-users'] });
              await new Promise(resolve => setTimeout(resolve, 200));
              
              console.log('[USER_FORM] refetchDispatchUsers 호출');
              const refetchResult = await refetchDispatchUsers();
              console.log('[USER_FORM] refetchDispatchUsers 결과:', refetchResult);
              console.log('[USER_FORM] refetchDispatchUsers 데이터:', refetchResult?.data);
              
              console.log('[USER_FORM] queryClient.refetchQueries 호출');
              await queryClient.refetchQueries({ queryKey: ['dispatch-users'] });
              console.log('[USER_FORM] 배차 업체 정보 다시 불러오기 완료');
            } catch (dispatchError: any) {
              console.error('[USER_FORM] 배차 업체 연결 업데이트 실패:', dispatchError);
              console.error('[USER_FORM] 에러 상세:', {
                message: dispatchError?.message,
                response: dispatchError?.response?.data,
                status: dispatchError?.response?.status,
              });
              toast({
                title: '배차 업체 연결 업데이트 실패',
                description: dispatchError?.response?.data?.message || '배차 업체 연결을 업데이트하는 중 오류가 발생했습니다.',
                variant: 'destructive',
              });
            }
          } else {
            console.log('[USER_FORM] 배차 업체 연결 변경 없음 - 업데이트 스킵');
          }
        } 
        // 기존 연결이 없고 배차 업체 역할이 선택되어 있고 배차 업체 ID가 있으면 생성
        else if (!existingDispatchUser && hasDispatchCompanyRole && data.dispatchCompanyId) {
            console.log('[USER_FORM] 새로운 배차 업체 연결 생성 시도 - 사용자 ID:', user!.id, '배차 업체 ID:', data.dispatchCompanyId);
            try {
              const createResult = await createDispatchUser.mutateAsync({
                userId: user!.id,
                dispatchCompanyId: data.dispatchCompanyId,
                name: data.name || user!.name || user!.email || '',
              });
              console.log('[USER_FORM] 배차 업체 연결 생성 성공:', createResult);
              queryClient.invalidateQueries({ queryKey: ['dispatch-users'] });
              await new Promise(resolve => setTimeout(resolve, 100));
              await queryClient.refetchQueries({ queryKey: ['dispatch-users'] });
            } catch (dispatchError: any) {
              console.error('[USER_FORM] 배차 업체 연결 생성 실패:', dispatchError);
              console.error('[USER_FORM] 에러 상세:', {
                message: dispatchError?.message,
                response: dispatchError?.response?.data,
                status: dispatchError?.response?.status,
              });
              toast({
                title: '배차 업체 연결 실패',
              description: dispatchError?.response?.data?.message || '배차 업체 연결에 실패했습니다.',
                variant: 'destructive',
              });
            }
          }
          // 배차 업체 역할이 해제된 경우, 기존 연결 삭제
        else if (!hasDispatchCompanyRole && existingDispatchUser) {
          console.log('[USER_FORM] 배차 업체 역할이 해제되었지만 기존 연결이 있음 - 삭제는 하지 않고 유지');
          // 배차 업체 역할이 해제되어도 기존 연결은 유지 (나중에 다시 역할을 선택할 수 있도록)
        } 
        else {
          console.log('[USER_FORM] 배차 업체 관련 처리 없음 - hasDispatchCompanyRole:', hasDispatchCompanyRole, 'data.dispatchCompanyId:', data.dispatchCompanyId, 'existingDispatchUser:', existingDispatchUser);
        }

        toast({
          title: '사용자 정보가 저장되었습니다.',
          description: `${data.email ?? user?.email ?? '사용자'}의 정보를 업데이트했습니다.`,
        });
      }
      onOpenChange(false);
      reset();
    } catch (error: any) {
      const message = error?.response?.data?.message ?? error?.message ?? '오류가 발생했습니다.';
      toast({
        title: '사용자 저장 실패',
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
                {mode === 'create' ? '사용자 추가' : '사용자 수정'}
              </DrawerTitle>
              <DrawerDescription>
                {mode === 'create'
                  ? '새로운 사용자를 추가합니다.'
                  : '사용자 정보를 수정합니다.'}
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
              <Label htmlFor="email">
                이메일 <span className="text-destructive">*</span>
                {user?.googleId && (
                  <Badge variant="default" className="ml-2">
                    구글 로그인
                  </Badge>
                )}
              </Label>
              <Input
                id="email"
                type="email"
                size="sm"
                placeholder="user@example.com"
                {...register('email', {
                  required: '이메일을 입력해주세요.',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: '올바른 이메일 형식이 아닙니다.',
                  },
                })}
                disabled={mode === 'edit'}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
              {user?.googleId && (
                <p className="text-xs text-muted-foreground">
                  구글 로그인 사용자는 비밀번호를 변경할 수 없습니다.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input
                id="name"
                type="text"
                size="sm"
                placeholder="홍길동"
                {...register('name')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">전화번호</Label>
              <Input
                id="phone"
                type="tel"
                size="sm"
                placeholder="010-1234-5678"
                {...register('phone', {
                  onChange: (e) => {
                    const formatted = formatPhone(e.target.value);
                    setValue('phone', formatted, { shouldDirty: true, shouldValidate: true });
                  },
                })}
              />
            </div>

            {!user?.googleId && (
              <div className="space-y-2">
                <Label htmlFor="password">
                  비밀번호 {mode === 'edit' && <span className="text-muted-foreground text-xs">(변경 시에만 입력)</span>}
                  {mode === 'create' && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="password"
                  type="password"
                  size="sm"
                  placeholder={mode === 'create' ? '비밀번호를 입력하세요' : '변경할 비밀번호를 입력하세요'}
                  {...register('password', {
                    required: mode === 'create' ? '비밀번호를 입력해주세요.' : false,
                    minLength: mode === 'create' ? {
                      value: 8,
                      message: '비밀번호는 최소 8자 이상이어야 합니다.',
                    } : undefined,
                  })}
                  className={errors.password ? 'border-destructive' : ''}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
              </div>
            )}

            {mode === 'create' && !user?.googleId && (
              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">
                  비밀번호 확인 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  size="sm"
                  placeholder="비밀번호를 다시 입력하세요"
                  {...register('passwordConfirm', {
                    required: '비밀번호 확인을 입력해주세요.',
                    validate: (value) => {
                      if (value !== password) {
                        return '비밀번호가 일치하지 않습니다.';
                      }
                    },
                  })}
                  className={errors.passwordConfirm ? 'border-destructive' : ''}
                />
                {errors.passwordConfirm && (
                  <p className="text-sm text-destructive">{errors.passwordConfirm.message}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>역할 (권한)</Label>
              <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">등록된 역할이 없습니다.</p>
                ) : (
                  roles.map((role) => {
                    const isChecked = Array.isArray(roleIds) && roleIds.includes(role.id);
                    return (
                      <div
                        key={role.id}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => {
                            handleRoleToggle(role.id);
                            // 역할 해제 시 관련 회사도 초기화
                            if (isChecked) {
                              if (role.code === 'ROLE_DISPATCH_COMPANY_USER') {
                                setValue('dispatchCompanyId', undefined);
                              } else if (role.code === 'ROLE_WAREHOUSE_COMPANY_USER') {
                                setValue('warehouseId', undefined);
                              }
                            }
                          }}
                        />
                        <div 
                          className="flex-1"
                          onClick={() => {
                            handleRoleToggle(role.id);
                            // 역할 해제 시 관련 회사도 초기화
                            if (isChecked) {
                              if (role.code === 'ROLE_DISPATCH_COMPANY_USER') {
                                setValue('dispatchCompanyId', undefined);
                              } else if (role.code === 'ROLE_WAREHOUSE_COMPANY_USER') {
                                setValue('warehouseId', undefined);
                              }
                            }
                          }}
                        >
                          <div className="text-sm font-medium">{role.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{role.code}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 배차 업체 선택 (ROLE_DISPATCH_COMPANY_USER 선택 시) */}
            {hasDispatchCompanyRole && (
              <div className="space-y-2">
                <Label htmlFor="dispatchCompanyId">
                  배차 업체 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={dispatchCompanyId ? dispatchCompanyId.toString() : ''}
                  onValueChange={(value) => {
                    setValue('dispatchCompanyId', value ? parseInt(value, 10) : undefined, {
                      shouldValidate: true,
                    });
                  }}
                >
                  <SelectTrigger id="dispatchCompanyId" size="sm">
                    <SelectValue placeholder="배차 업체를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {dispatchCompanies.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        등록된 배차 업체가 없습니다.
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
                  <p className="text-sm text-destructive">{errors.dispatchCompanyId.message}</p>
                )}
              </div>
            )}

            {/* 창고 선택 (ROLE_WAREHOUSE_COMPANY_USER 선택 시) */}
            {hasWarehouseCompanyRole && (
              <div className="space-y-2">
                <Label htmlFor="warehouseId">
                  창고 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={warehouseId ? warehouseId.toString() : ''}
                  onValueChange={(value) => {
                    setValue('warehouseId', value ? parseInt(value, 10) : undefined, {
                      shouldValidate: true,
                    });
                  }}
                >
                  <SelectTrigger id="warehouseId" size="sm">
                    <SelectValue placeholder="창고를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        등록된 창고가 없습니다.
                      </div>
                    ) : (
                      warehouses.map((wh) => (
                        <SelectItem key={wh.id} value={wh.id.toString()}>
                          {wh.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.warehouseId && (
                  <p className="text-sm text-destructive">{errors.warehouseId.message}</p>
                )}
              </div>
            )}

            {/* 상태 (가장 아래) */}
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
                <Button type="button" variant="outline" size="sm" disabled={isSubmitting} className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  취소
                </Button>
              </DrawerClose>
              <Button type="submit" size="sm" disabled={isSubmitting} className="flex items-center gap-2">
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
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
