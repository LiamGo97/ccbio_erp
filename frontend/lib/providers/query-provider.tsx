'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // SSR을 위해 기본값 설정
            staleTime: 60 * 1000, // 1분
            refetchOnWindowFocus: 'always', // 탭 활성화 시 항상 갱신 (staleTime 무시, 다른 브라우저에서 수정해도 반영)
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} position={"top-left" as any} />
    </QueryClientProvider>
  );
}

