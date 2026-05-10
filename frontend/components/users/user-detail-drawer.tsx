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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useUser } from '@/lib/hooks/use-users';
import { useDispatchUsers } from '@/lib/hooks/use-dispatch-users';
import { useWarehouses } from '@/lib/hooks/use-warehouses';
import { useDispatchCompanies } from '@/lib/hooks/use-dispatch-companies';
import { Edit, X, Trash2, Loader2, Mail, User as UserIcon, Shield, Building2, Warehouse } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface UserDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number | null;
  onEdit?: (userId: number) => void;
  onDelete?: (userId: number) => void;
}

export function UserDetailDrawer({
  open,
  onOpenChange,
  userId,
  onEdit,
  onDelete,
}: UserDetailDrawerProps) {
  const { data, isLoading, refetch } = useUser(userId ?? undefined);
  
  // 배차 업체 정보 조회 (사용자 ID로 조회)
  const { data: dispatchUsers = [] } = useDispatchUsers();
  const dispatchUser = dispatchUsers.find((du) => du.userId === userId);
  
  // 배차 업체 목록 조회
  const { data: dispatchCompanies = [] } = useDispatchCompanies({ status: true });
  const dispatchCompany = dispatchCompanies.find((dc) => dc.id === dispatchUser?.dispatchCompanyId);
  
  // 창고 목록 조회
  const { data: warehouses = [] } = useWarehouses({ status: true });
  // 사용자의 창고 정보 조회
  const warehouse = data?.warehouseId ? warehouses.find((wh) => wh.id === data.warehouseId) : null;

  // drawer가 열릴 때마다 데이터 갱신
  React.useEffect(() => {
    if (open && userId) {
      refetch();
    }
  }, [open, userId, refetch]);

  const formatDate = (value?: string | Date | null) => {
    if (!value) return '-';
    try {
      const date = value instanceof Date ? value : new Date(value);
      return format(date, 'yyyy-MM-dd HH:mm', { locale: ko });
    } catch {
      return '-';
    }
  };

  if (!userId) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DrawerTitle>사용자 상세정보</DrawerTitle>
                <DrawerDescription>
                  사용자 정보를 선택해주세요.
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
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">사용자를 선택하면 상세 정보가 표시됩니다.</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (isLoading) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DrawerTitle>사용자 상세정보</DrawerTitle>
                <DrawerDescription>로딩 중...</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!data) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
          <DrawerHeader className="border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DrawerTitle>사용자 상세정보</DrawerTitle>
                <DrawerDescription>사용자를 찾을 수 없습니다.</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                  <span className="sr-only">닫기</span>
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">사용자 정보를 불러올 수 없습니다.</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const roles = data.roles || [];
  const hasDispatchCompanyRole = roles.some((role) => role.code === 'ROLE_DISPATCH_COMPANY_USER');
  const hasWarehouseCompanyRole = roles.some((role) => role.code === 'ROLE_WAREHOUSE_COMPANY_USER');
  const isActive = data.isActive !== false;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full" style={{ width: '600px', maxWidth: '90vw' }}>
        <DrawerHeader className="border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <DrawerTitle>사용자 상세정보</DrawerTitle>
              <DrawerDescription>
                사용자의 기본 정보와 권한을 확인할 수 있습니다.
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

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 기본 정보 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              기본 정보
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">이메일</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{data.email}</p>
                  {data.googleId && (
                    <Badge variant="default" className="text-xs">
                      구글 로그인
                    </Badge>
                  )}
                </div>
              </div>
              {data.name && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">이름</Label>
                  <p className="mt-1 text-sm">{data.name}</p>
                </div>
              )}
              {data.phone && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">전화번호</Label>
                  <p className="mt-1 text-sm">{data.phone}</p>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium text-muted-foreground">상태</Label>
                <div className="mt-1">
                  <Badge variant={isActive ? 'default' : 'secondary'}>
                    {isActive ? '활성' : '비활성'}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">가입일</Label>
                <p className="mt-1 text-sm">{formatDate(data.createdAt)}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* 역할 정보 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4" />
              역할 (권한)
            </h3>
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">할당된 역할이 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge key={role.id} variant="outline" className="text-xs">
                    {role.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* 배차 업체 정보 */}
          {hasDispatchCompanyRole && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  배차 업체 정보
                </h3>
                {dispatchCompany ? (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">배차 업체</Label>
                    <p className="mt-1 text-sm font-medium">{dispatchCompany.name}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">연결된 배차 업체가 없습니다.</p>
                )}
              </div>
            </>
          )}

          {/* 창고 정보 */}
          {hasWarehouseCompanyRole && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Warehouse className="h-4 w-4" />
                  창고 정보
                </h3>
                {warehouse ? (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">창고명</Label>
                      <p className="mt-1 text-sm font-medium">{warehouse.name}</p>
                    </div>
                    {warehouse.address && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">주소</Label>
                        <p className="mt-1 text-sm">
                          {warehouse.postalCode && `[${warehouse.postalCode}] `}
                          {warehouse.address}
                          {warehouse.addressDetail && ` ${warehouse.addressDetail}`}
                        </p>
                      </div>
                    )}
                    {warehouse.gyegeundaeAddress && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">계근대 주소</Label>
                        <p className="mt-1 text-sm">
                          {warehouse.gyegeundaePostalCode && `[${warehouse.gyegeundaePostalCode}] `}
                          {warehouse.gyegeundaeAddress}
                          {warehouse.gyegeundaeAddressDetail && ` ${warehouse.gyegeundaeAddressDetail}`}
                        </p>
                      </div>
                    )}
                    {warehouse.phone && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">연락처</Label>
                        <p className="mt-1 text-sm">{warehouse.phone}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">연결된 창고 정보가 없습니다.</p>
                )}
              </div>
            </>
          )}
        </div>

        <DrawerFooter className="border-t border-border">
          <div className="flex gap-2 justify-end">
            {onDelete && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (userId && onDelete) {
                    onOpenChange(false);
                    onDelete(userId);
                  }
                }}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                삭제
              </Button>
            )}
            {onEdit && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (userId && onEdit) {
                    onOpenChange(false);
                    onEdit(userId);
                  }
                }}
                className="flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                수정
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

