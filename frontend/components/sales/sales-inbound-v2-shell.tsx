'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { auth, User } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function SalesInboundV2Shell({
  title,
  legacyHref,
  legacyLabel,
}: {
  title: string;
  legacyHref: string;
  legacyLabel: string;
}) {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    void auth.getCurrentUser().then(setUser);
  }, []);

  if (!user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" aria-label="로딩" />
      </div>
    );
  }

  return (
    <AppLayout user={user}>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            BL·컨테이너 그룹 단위 신규 입고 화면입니다. 목록·연동 API는 이후 단계에서 붙입니다.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>준비 중</CardTitle>
            <CardDescription>
              기존 입고는 메뉴 「영업」의 입고 관리 또는 「구메뉴」의 영업관리를 이용할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={() => router.push(legacyHref)}>
              {legacyLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
