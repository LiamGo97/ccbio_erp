# 다른 PC에서 접근하기 - 실전 가이드

Google OAuth는 IP 주소를 리디렉션 URI로 허용하지 않으므로, 도메인이 필요합니다.

## 방법 1: DuckDNS 사용 (가장 간단, 무료)

### 1단계: DuckDNS에서 도메인 생성

1. [DuckDNS](https://www.duckdns.org/) 접속
2. "Sign in with Google" 또는 "Sign in with GitHub"로 로그인
3. "Add Domain" 클릭
4. 원하는 도메인 이름 입력 (예: `ccbio-erp`)
5. 생성된 도메인: `ccbio-erp.duckdns.org`
6. 현재 IP 주소 입력: `121.137.149.179`
7. "Add Domain" 클릭

### 2단계: Google Cloud Console에 도메인 등록

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택
3. **"API 및 서비스" > "사용자 인증 정보"** 클릭
4. OAuth 2.0 클라이언트 ID 클릭
5. **"승인된 리디렉션 URI"** 섹션에서 **"URI 추가"** 클릭
6. 다음 URI 추가:
   ```
   http://ccbio-erp.duckdns.org:3001/api/auth/google/callback
   ```
7. **"저장"** 클릭

### 3단계: 백엔드 환경 변수 설정

`backend/.env` 파일 수정:

```env
# 도메인 사용
FRONTEND_URL=http://ccbio-erp.duckdns.org:3000
GOOGLE_CALLBACK_URL=http://ccbio-erp.duckdns.org:3001/api/auth/google/callback
```

### 4단계: 프론트엔드 환경 변수 설정

`frontend/.env.local` 파일 수정:

```env
NEXT_PUBLIC_API_URL=http://ccbio-erp.duckdns.org:3001/api
```

### 5단계: 서버 실행 및 접근

1. 백엔드/프론트엔드 서버 실행
2. 다른 PC의 브라우저에서 접근:
   ```
   http://ccbio-erp.duckdns.org:3000
   ```

**참고:** IP 주소가 변경되면 DuckDNS에서 IP 주소를 업데이트해야 합니다.

---

## 방법 2: SSH 터널링 사용

다른 PC에서 SSH 접속이 가능한 경우 사용할 수 있습니다.

### 1단계: Google Cloud Console에는 localhost만 등록

```
http://localhost:3001/api/auth/google/callback
```

### 2단계: 다른 PC에서 SSH 터널링 설정

다른 PC의 터미널에서 실행:

```bash
ssh -L 3000:localhost:3000 -L 3001:localhost:3001 사용자명@121.137.149.179
```

예시:
```bash
ssh -L 3000:localhost:3000 -L 3001:localhost:3001 mikisun@121.137.149.179
```

### 3단계: 브라우저에서 접근

SSH 터널링이 활성화된 상태에서:
```
http://localhost:3000
```

**장점:** Google OAuth가 정상 작동
**단점:** SSH 연결이 끊기면 접근 불가

---

## 방법 3: 임시로 구글 로그인 없이 사용

구글 로그인을 사용하지 않는다면 IP 주소로 바로 접근 가능합니다.

### 1단계: 백엔드 환경 변수 설정

`backend/.env` 파일:
```env
# FRONTEND_URL, GOOGLE_CALLBACK_URL 설정 안 해도 됨
```

### 2단계: 프론트엔드 환경 변수 설정

`frontend/.env.local` 파일:
```env
NEXT_PUBLIC_API_URL=http://121.137.149.179:3001/api
```

### 3단계: 접근

다른 PC의 브라우저에서:
```
http://121.137.149.179:3000
```

**단점:** 구글 로그인 사용 불가 (일반 이메일/비밀번호 로그인만 가능)

---

## 추천 방법

**가장 간단하고 실용적인 방법: DuckDNS 사용**

1. 무료
2. 설정이 간단
3. 구글 로그인 정상 작동
4. 다른 PC에서 바로 접근 가능

단, IP 주소가 변경되면 DuckDNS에서 업데이트해야 합니다.

