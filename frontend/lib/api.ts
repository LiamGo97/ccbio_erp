import axios from 'axios';
import Cookies from 'js-cookie';
import { AUTH_TOKEN_COOKIE_NAME } from './auth-constants';

/** axios 인터셉터와 동일 규칙 — EventSource URL 등에 사용 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const protocol = window.location.protocol;
  const host = window.location.host;
  if (host.includes('run.app')) {
    return `${protocol}//${host}/api`;
  }
  if (host.includes('localhost')) {
    return `http://localhost:3001/api`;
  }
  return `http://${host.split(':')[0]}:3001/api`;
}

// baseURL은 런타임에 인터셉터에서 설정하므로 빌드 타임에 고정되지 않음
export const api = axios.create({
  baseURL: '', // 빈 문자열로 초기화, 인터셉터에서 동적으로 설정
  withCredentials: true,
});

const CLIENT_PATH_HEADER = 'X-Client-Path';
const MAX_CLIENT_PATH_LEN = 500;

// 요청 인터셉터: baseURL을 동적으로 설정 (브라우저 환경에서)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    config.baseURL = getApiBaseUrl();
    const pathname = window.location.pathname ?? '';
    if (pathname) {
      const truncated =
        pathname.length > MAX_CLIENT_PATH_LEN
          ? pathname.slice(0, MAX_CLIENT_PATH_LEN)
          : pathname;
      config.headers.set(CLIENT_PATH_HEADER, truncated);
    }
  }

  // 토큰 자동 추가
  const token = Cookies.get(AUTH_TOKEN_COOKIE_NAME);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 응답 인터셉터: 401 에러 처리
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove(AUTH_TOKEN_COOKIE_NAME);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;

