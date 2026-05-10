# 네트워크 접근 설정 가이드

다른 PC에서 IP 주소로 접근할 수 있도록 설정하는 방법입니다.

## 1. 백엔드 환경 변수 설정

`backend/.env` 파일에 다음 내용을 추가/수정하세요:

```env
# 서버 URL (IP 주소 또는 도메인)
SERVER_URL=http://121.137.149.179:3001

# 프론트엔드 URL
FRONTEND_URL=http://121.137.149.179:3000

# Google OAuth 콜백 URL
GOOGLE_CALLBACK_URL=http://121.137.149.179:3001/api/auth/google/callback

# CORS 허용 Origin (쉼표로 구분)
ALLOWED_ORIGINS=http://121.137.149.179:3000,http://localhost:3000
```

## 2. 프론트엔드 환경 변수 설정

`frontend/.env.local` 파일에 다음 내용을 추가/수정하세요:

```env
# 백엔드 API URL
NEXT_PUBLIC_API_URL=http://121.137.149.179:3001/api
```

## 3. Google Cloud Console 설정

**⚠️ 중요: Google OAuth는 IP 주소를 리디렉션 URI로 허용하지 않습니다! 도메인만 허용됩니다.**

### 방법 1: 도메인 사용 (권장)

도메인이 있다면 도메인으로 등록:
```
http://yourdomain.com:3001/api/auth/google/callback
```

### 방법 2: SSH 터널링 사용 (IP 주소만 있는 경우)

1. Google Cloud Console에는 **localhost만** 등록:
   ```
   http://localhost:3001/api/auth/google/callback
   ```

2. 다른 PC에서 SSH 터널링으로 접근:
   ```bash
   # 다른 PC에서 실행 (터미널)
   ssh -L 3000:localhost:3000 -L 3001:localhost:3001 user@121.137.149.179
   ```
   
3. 터널링 후 브라우저에서 `http://localhost:3000`으로 접근

### 방법 3: 동적 DNS 서비스 사용

1. [DuckDNS](https://www.duckdns.org/) 또는 [No-IP](https://www.noip.com/) 같은 무료 동적 DNS 서비스 사용
2. 도메인 생성 (예: `myapp.duckdns.org`)
3. Google Cloud Console에 등록:
   ```
   http://myapp.duckdns.org:3001/api/auth/google/callback
   ```

## 4. 프론트엔드 서버 실행 (네트워크 접근 허용)

프론트엔드를 다른 PC에서 접근 가능하도록 실행:

```bash
cd frontend
# Next.js를 모든 네트워크 인터페이스에서 접근 가능하도록 실행
HOSTNAME=0.0.0.0 PORT=3000 yarn dev
```

또는 `package.json`의 `dev` 스크립트를 수정:

```json
{
  "scripts": {
    "dev": "next dev -H 0.0.0.0 -p 3000"
  }
}
```

## 5. 백엔드 서버 실행

백엔드는 이미 `0.0.0.0`으로 설정되어 있으므로 그대로 실행:

```bash
cd backend
yarn start:dev
```

## 6. 방화벽 설정 확인

서버 PC에서 포트 3000, 3001이 열려있는지 확인:

```bash
# macOS/Linux
sudo lsof -i :3000
sudo lsof -i :3001

# 방화벽이 막고 있다면 포트 열기 (macOS)
# 시스템 설정 > 네트워크 > 방화벽 > 옵션 > 자동으로 서명된 소프트웨어가 들어오는 연결 허용
```

## 7. 접근 테스트

다른 PC의 브라우저에서 접근:

- 프론트엔드: `http://121.137.149.179:3000`
- 백엔드 API: `http://121.137.149.179:3001/api`
- Swagger 문서: `http://121.137.149.179:3001/api/docs`

## 문제 해결

### CORS 에러가 발생하는 경우
- `ALLOWED_ORIGINS`에 접근하려는 URL이 포함되어 있는지 확인
- 개발 환경(`NODE_ENV=development`)에서는 모든 origin이 허용됩니다

### Google OAuth 리디렉션 에러
- Google Cloud Console에 리디렉션 URI가 정확히 등록되어 있는지 확인
- URI는 정확히 일치해야 합니다 (슬래시 포함 여부, http/https 등)

### 연결이 안 되는 경우
- 서버 PC의 방화벽 설정 확인
- 같은 네트워크에 있는지 확인
- IP 주소가 올바른지 확인 (`ifconfig` 또는 `ipconfig`로 확인)

