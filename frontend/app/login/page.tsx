'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { auth, User } from '@/lib/auth';
import { Chrome, Mail } from 'lucide-react';

// 사용자 권한에 따른 리다이렉트 경로 결정
function getUserRedirectPath(user: User | null): string {
  if (!user?.roles) return '/dashboard';
  
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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  useEffect(() => {
    // 이미 로그인되어 있으면 권한에 따라 리다이렉트
    const alreadyAuthed = auth.isAuthenticated();
    if (alreadyAuthed) {
      console.log('[Login] already authenticated, checking user role');
      auth.getCurrentUser().then((user) => {
        if (user) {
          const redirectPath = getUserRedirectPath(user);
          console.log('[Login] redirecting to', redirectPath);
          router.push(redirectPath);
        } else {
          router.push('/dashboard');
        }
      });
      return;
    } else {
      console.log('[Login] no existing token detected');
    }

    // OAuth 콜백에서 토큰 처리
    const token = searchParams.get('token');
    if (token) {
      console.log('[Login] token query param found, storing token and redirecting');
      auth.setToken(token);
      auth.getCurrentUser().then((user) => {
        if (user) {
          const redirectPath = getUserRedirectPath(user);
          console.log('[Login] redirecting to', redirectPath);
          router.push(redirectPath);
        } else {
          router.push('/dashboard');
        }
      });
      return;
    } else {
      console.log('[Login] no token in query params');
    }

    // 에러 메시지 표시
    const errorParam = searchParams.get('error');
    if (errorParam) {
      console.warn('[Login] query error param detected', errorParam);
      setError(decodeURIComponent(errorParam));
    }
  }, [router, searchParams]);

  const handleGoogleLogin = () => {
    auth.loginWithGoogle();
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await auth.loginWithEmail(email, password);
      console.log('[Login] login success, checking user role');
      const user = await auth.getCurrentUser();
      const redirectPath = getUserRedirectPath(user);
      console.log('[Login] redirecting to', redirectPath);
      router.push(redirectPath);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
        '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-md shadow-xl mx-auto">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight text-center">CCBio ERP</CardTitle>
          <CardDescription className="text-base text-center">
            내부 업무 시스템에 로그인하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showEmailLogin ? (
            <>
              <Button
                onClick={handleGoogleLogin}
                className="w-full h-12 text-base"
                size="lg"
                variant="default"
              >
                <Chrome className="mr-2 h-5 w-5" />
                Google로 로그인
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">또는</span>
                </div>
              </div>
              <Button
                onClick={() => setShowEmailLogin(true)}
                className="w-full h-12 text-base"
                size="lg"
                variant="outline"
              >
                <Mail className="mr-2 h-5 w-5" />
                이메일로 로그인
              </Button>
            </>
          ) : (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                className="w-full h-12 text-base"
                size="lg"
                disabled={loading}
              >
                {loading ? '로그인 중...' : '로그인'}
              </Button>
              <div className="text-center space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setShowEmailLogin(false)}
                  disabled={loading}
                >
                  다른 방법으로 로그인
                </Button>
                <p className="text-sm text-muted-foreground">
                  계정이 없으신가요?{' '}
                  <Link href="/register" className="text-primary hover:underline">
                    회원가입
                  </Link>
                </p>
              </div>
            </form>
          )}
          <p className="text-xs text-center text-muted-foreground">
            로그인하면 서비스 이용약관 및 개인정보처리방침에 동의하는 것으로 간주됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <Card className="w-full max-w-md shadow-xl mx-auto">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">로딩 중...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

