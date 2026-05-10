'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, User } from '@/lib/auth';

// 사용자 권한에 따른 리다이렉트 경로 결정
function getUserRedirectPath(user: User | null): string {
  // 권한이 없으면 승인 대기 페이지로
  if (!user?.roles || user.roles.length === 0) {
    return '/pending-approval';
  }
  
  const hasDispatchCompanyUser = user.roles.some((role) => role.code === 'ROLE_DISPATCH_COMPANY_USER');
  const hasWarehouseCompanyUser = user.roles.some((role) => role.code === 'ROLE_WAREHOUSE_COMPANY_USER');
  const hasSystemUser = user.roles.some((role) => role.code === 'ROLE_SYSTEM' || role.code === 'ROLE_ADMIN');
  
  // 배차 업체 사용자이고 시스템 권한이 없으면 배차 관리 페이지로
  if (hasDispatchCompanyUser && !hasSystemUser) {
    return '/vehicle-dispatch-user';
  }
  
  // 창고 업체 사용자이고 시스템 권한이 없으면 상차 관리 페이지로
  if (hasWarehouseCompanyUser && !hasSystemUser) {
    return '/vehicle-dispatch-warehouse';
  }
  
  return '/dashboard';
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (auth.isAuthenticated()) {
      auth.getCurrentUser().then((user) => {
        const redirectPath = getUserRedirectPath(user);
        router.push(redirectPath);
      });
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">로딩 중...</p>
      </div>
    </div>
  );
}
