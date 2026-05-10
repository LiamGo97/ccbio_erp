'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { auth, User } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Mail } from 'lucide-react';

export default function PendingApprovalPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    auth.getCurrentUser().then((currentUser) => {
      setUser(currentUser);
      setLoading(false);
      
      // 권한이 있으면 적절한 페이지로 리다이렉트
      if (currentUser?.roles && currentUser.roles.length > 0) {
        const hasDispatchCompanyUser = currentUser.roles.some(
          (role) => role.code === 'ROLE_DISPATCH_COMPANY_USER'
        );
        const hasWarehouseCompanyUser = currentUser.roles.some(
          (role) => role.code === 'ROLE_WAREHOUSE_COMPANY_USER'
        );
        const hasSystemUser = currentUser.roles.some(
          (role) => role.code === 'ROLE_SYSTEM' || role.code === 'ROLE_ADMIN'
        );
        
        if (hasDispatchCompanyUser && !hasSystemUser) {
          router.push('/vehicle-dispatch-user');
        } else if (hasWarehouseCompanyUser && !hasSystemUser) {
          router.push('/vehicle-dispatch-warehouse');
        } else {
          router.push('/dashboard');
        }
      }
    });
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <AlertCircle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
          </div>
          <CardTitle className="text-2xl">승인 대기 중</CardTitle>
          <CardDescription className="mt-2">
            계정이 아직 승인되지 않았습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              관리자에게 문의하여 계정 승인을 요청해주세요.
            </p>
          </div>
          
          {user?.email && (
            <div className="flex items-center gap-2 rounded-lg border p-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">등록된 이메일</p>
                <p className="text-sm font-medium">{user.email}</p>
              </div>
            </div>
          )}

          <div className="pt-4">
            <button
              onClick={() => auth.logout()}
              className="w-full text-sm text-muted-foreground hover:text-foreground underline"
            >
              다른 계정으로 로그인
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

