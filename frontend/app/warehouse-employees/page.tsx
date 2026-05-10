'use client';

import * as React from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';

export default function WarehouseEmployeesPage() {
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  return (
    <AppLayout user={user}>
      <div className="container mx-auto py-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">직원 관리</h1>
            <p className="text-muted-foreground mt-2">
              창고별 직원 정보를 관리합니다.
            </p>
          </div>

          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <p>직원 관리 기능은 준비 중입니다.</p>
            <p className="text-sm mt-2">데이터 구조를 정의한 후 기능을 추가하겠습니다.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}


