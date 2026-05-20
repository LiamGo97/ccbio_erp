'use client';

import * as React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Loader2 } from 'lucide-react';

/** 신규 판매관리: AppLayout만 제공 (탭·상단 안내 없음) */
export function SalesManagementV2Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    void auth.getCurrentUser().then(setUser);
  }, []);

  if (!user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="로딩" />
      </div>
    );
  }

  return <AppLayout user={user}>{children}</AppLayout>;
}
