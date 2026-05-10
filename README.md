# CCBio ERP 시스템

내부 업무 시스템과 농장 경영 관리 시스템을 위한 통합 프로젝트

## 기술 스택

### 백엔드
- **NestJS** - Node.js 프레임워크
- **TypeScript** - 타입 안정성
- **PostgreSQL** - 데이터베이스
- **TypeORM** - ORM
- **Passport** - 인증 (Google OAuth)

### 프론트엔드
- **Next.js 14** - React 프레임워크 (App Router)
- **TypeScript** - 타입 안정성
- **Tailwind CSS** - 스타일링
- **shadcn/ui** - UI 컴포넌트
- **Yarn** - 패키지 매니저

## 프로젝트 구조

```
ccbio_erp/
├── backend/                    # NestJS 백엔드 (공유 API)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/          # 인증 모듈 (Google OAuth)
│   │   │   ├── users/         # 사용자 관리
│   │   │   ├── erp/           # 내부 업무 시스템 API
│   │   │   └── farm/          # 농장 경영 관리 API
│   │   ├── common/            # 공통 모듈 (가드, 인터셉터 등)
│   │   ├── config/            # 설정 파일
│   │   └── main.ts            # 진입점
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                   # Next.js 프론트엔드
│   ├── app/                   # Next.js App Router
│   │   ├── login/             # 로그인 페이지
│   │   ├── dashboard/         # 대시보드
│   │   └── auth/              # 인증 콜백
│   ├── components/            # React 컴포넌트
│   │   └── ui/                # shadcn/ui 컴포넌트
│   └── lib/                   # 유틸리티 및 API 클라이언트
│
└── README.md
```

## 설치 및 실행

### 백엔드
```bash
cd backend
yarn install
yarn start:dev
```

### 프론트엔드
```bash
cd frontend
yarn install
yarn dev
```

## 환경 변수 설정

### 백엔드 (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/ccbio_erp
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# SSO를 위한 여러 프론트엔드 도메인 허용 (쉼표로 구분)
# 예: ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002,https://shop.ccbio.com
ALLOWED_ORIGINS=http://localhost:3000
```

### 프론트엔드 (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## 시작하기

1. **PostgreSQL 데이터베이스 생성**
```bash
createdb ccbio_erp
```

2. **백엔드 환경 변수 설정**
```bash
cd backend
cp .env.example .env
# .env 파일을 열어서 실제 값으로 수정
```

3. **백엔드 의존성 설치 및 실행**
```bash
cd backend
yarn install
yarn start:dev
```

4. **프론트엔드 환경 변수 설정**
```bash
cd frontend
cp .env.local.example .env.local
# .env.local 파일을 열어서 API URL 확인
```

5. **프론트엔드 실행**
```bash
cd frontend
yarn install
yarn dev
```

6. **Google OAuth 설정**
   - [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
   - OAuth 2.0 클라이언트 ID 생성
   - 승인된 리디렉션 URI 추가: `http://localhost:3001/api/auth/google/callback`
   - 클라이언트 ID와 시크릿을 백엔드 `.env`에 추가

## 주요 기능

- ✅ Google OAuth 로그인
- ✅ JWT 기반 인증
- ✅ 보호된 라우트
- ✅ 현대적인 UI (shadcn/ui + Tailwind CSS)
- ✅ SSO (Single Sign-On) 지원

## SSO (Single Sign-On) 지원

이 프로젝트는 여러 프론트엔드 애플리케이션(ERP, 쇼핑몰, 농장 관리 등)에서 동일한 인증을 공유할 수 있도록 설계되었습니다.

### SSO 작동 방식

1. **중앙 인증 서버**: 모든 시스템이 동일한 백엔드 API를 사용
2. **JWT 토큰 공유**: 한 시스템에서 로그인하면 JWT 토큰을 받고, 다른 시스템에서도 동일한 토큰 사용
3. **토큰 검증**: 각 시스템에서 `/api/auth/verify` 엔드포인트로 토큰 유효성 확인

### 새로운 시스템 추가하기

1. **백엔드 CORS 설정**
   ```env
   # backend/.env
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002,https://shop.ccbio.com
   ```

2. **새 프론트엔드에서 동일한 API 사용**
   ```typescript
   // 새 프론트엔드의 lib/api.ts
   const API_URL = 'http://localhost:3001/api'; // 동일한 백엔드
   ```

3. **토큰 공유 방법**
   - **같은 도메인/서브도메인**: 쿠키에 저장하면 자동 공유
     - 예: `erp.ccbio.com`, `shop.ccbio.com` → 쿠키 도메인: `.ccbio.com`
   - **다른 도메인**: localStorage에 저장하고, 필요시 다른 도메인으로 전달
   - **서브도메인**: 쿠키 `domain` 설정으로 공유 가능

### 예시: 쇼핑몰 추가

```typescript
// shop-frontend/lib/auth.ts
import api from './api';
import Cookies from 'js-cookie';

// ERP에서 로그인한 토큰이 있으면 사용
const token = Cookies.get('token') || localStorage.getItem('token');
if (token) {
  // 토큰 검증
  const response = await api.get('/auth/verify');
  if (response.data.valid) {
    // 로그인 상태 유지
  }
}
```

### 토큰 저장 전략

- **같은 도메인**: 쿠키 사용 (자동 공유)
- **다른 도메인**: localStorage + 필요시 전달
- **서브도메인**: 쿠키 `domain` 설정 (예: `.ccbio.com`)

