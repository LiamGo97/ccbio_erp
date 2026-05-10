'use client';

import * as React from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { User, auth } from '@/lib/auth';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppLayoutProps {
  children: React.ReactNode;
  user?: User | null;
}

function MobileHeader() {
  const { isMobile } = useSidebar();
  
  if (!isMobile) {
    return null;
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
    </header>
  );
}

export function AppLayout({ children, user: initialUser }: AppLayoutProps) {
  const [user, setUser] = React.useState<User | null>(initialUser || null);

  // 사용자 정보 주기적 갱신 (5분마다)
  // 관리자가 역할을 추가해도 자동으로 반영됨
  React.useEffect(() => {
    if (!auth.isAuthenticated()) {
      return;
    }

    // 초기 로드
    const fetchUser = async () => {
      try {
        const userData = await auth.getCurrentUser();
        if (userData) {
          setUser(userData);
        }
      } catch (error) {
        console.warn('[AppLayout] 사용자 정보 갱신 실패:', error);
      }
    };

    fetchUser();

    // 5분마다 사용자 정보 갱신
    const interval = setInterval(fetchUser, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar user={user} />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <MobileHeader />
        {/* 바깥은 overflow-hidden으로 높이만 전달, 안쪽만 overflow-y-auto → 자식이 flex-1+min-h-0이면 뷰포트 안에서 내부 스크롤·sticky 가능 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4 md:px-6 md:pb-8">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

