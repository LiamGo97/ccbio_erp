import Cookies from 'js-cookie';
import api from './api';
import { AUTH_TOKEN_COOKIE_NAME } from './auth-constants';

export interface User {
  id: number;
  email: string;
  name: string | null;
  phone?: string | null;
  picture: string | null;
  googleId?: string | null; // 구글 로그인 사용자 ID
  isActive?: boolean;
  warehouseId?: number | null;
  roles?: Array<{
    id: number;
    name: string;
    code: string;
    description?: string;
  }>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const auth = {
  // 토큰 저장
  setToken: (token: string) => {
    const isHttps =
      typeof window !== 'undefined' ? window.location.protocol === 'https:' : true;
    console.log(
      '[auth] setToken called',
      token ? `${token.slice(0, 10)}...` : '(empty)',
      '| secure:',
      isHttps,
    );
    Cookies.set(AUTH_TOKEN_COOKIE_NAME, token, {
      expires: 7,
      path: '/',
      secure: isHttps,
      sameSite: 'strict',
    });
  },

  // 토큰 가져오기
  getToken: (): string | undefined => {
    return Cookies.get(AUTH_TOKEN_COOKIE_NAME);
  },

  // 토큰 삭제
  removeToken: () => {
    Cookies.remove(AUTH_TOKEN_COOKIE_NAME);
    console.log('[auth] token removed');
  },

  // 로그인 여부 확인
  isAuthenticated: (): boolean => {
    const exists = !!Cookies.get(AUTH_TOKEN_COOKIE_NAME);
    console.log('[auth] isAuthenticated?', exists);
    return exists;
  },

  // 구글 로그인
  loginWithGoogle: () => {
    // 항상 런타임에 현재 호스트 기반으로 설정 (빌드 타임에 고정되지 않도록)
    if (typeof window === 'undefined') {
      return; // 서버 사이드에서는 실행하지 않음
    }
    
    const protocol = window.location.protocol;
    const host = window.location.host; // hostname + port (있는 경우)
    let backendUrl: string;
    
    // Cloud Run 환경에서는 같은 도메인에서 서빙되므로 /api 경로 사용
    if (host.includes('run.app')) {
      backendUrl = `${protocol}//${host}/api`;
    } else if (host.includes('localhost')) {
      backendUrl = `http://localhost:3001/api`;
    } else {
      // 기타 환경 (예: DuckDNS)
      backendUrl = `http://${host.split(':')[0]}:3001/api`;
    }
    
    window.location.href = `${backendUrl}/auth/google`;
  },

  // 로그아웃
  logout: async () => {
    try {
      await api.get('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      auth.removeToken();
      window.location.href = '/login';
    }
  },

  // 현재 사용자 정보 가져오기
  getCurrentUser: async (): Promise<User | null> => {
    try {
      console.log('[auth] fetching /auth/me ...');
      const response = await api.get('/auth/me');
      console.log('[auth] /auth/me success', response.data?.email);
      return response.data;
    } catch (error) {
      console.warn('[auth] /auth/me failed', error);
      return null;
    }
  },

  // 토큰 검증 (SSO용)
  verifyToken: async (): Promise<boolean> => {
    try {
      const response = await api.get('/auth/verify');
      return response.data.valid === true;
    } catch (error) {
      return false;
    }
  },

  // 이메일/패스워드 로그인
  loginWithEmail: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    auth.setToken(response.data.access_token);
    return response.data;
  },

  // 회원가입
  register: async (email: string, password: string, name?: string) => {
    const response = await api.post('/auth/register', { email, password, name });
    auth.setToken(response.data.access_token);
    return response.data;
  },
};

