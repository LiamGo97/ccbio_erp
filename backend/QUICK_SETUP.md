# 빠른 설정 가이드 - DuckDNS 도메인 사용

## 1. Google Cloud Console 설정

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

## 2. 백엔드 환경 변수 설정

`backend/.env` 파일에 추가/수정:

```env
FRONTEND_URL=http://ccbio-erp.duckdns.org:3000
GOOGLE_CALLBACK_URL=http://ccbio-erp.duckdns.org:3001/api/auth/google/callback
```

## 3. 프론트엔드 환경 변수 설정

`frontend/.env.local` 파일에 추가/수정:

```env
NEXT_PUBLIC_API_URL=http://ccbio-erp.duckdns.org:3001/api
```

## 4. 서버 재시작

백엔드와 프론트엔드를 재시작하세요.

## 5. 접근

다른 PC의 브라우저에서:
```
http://ccbio-erp.duckdns.org:3000
```

## 문제 해결

### 접속이 안 되는 경우

1. **서버가 실행 중인지 확인**
   ```bash
   # 백엔드 확인
   lsof -i :3001
   
   # 프론트엔드 확인
   lsof -i :3000
   ```

2. **방화벽 확인**
   - macOS: 시스템 설정 > 네트워크 > 방화벽
   - 포트 3000, 3001이 열려있는지 확인

3. **DuckDNS IP 주소 확인**
   - DuckDNS 대시보드에서 IP 주소가 `121.137.149.179`로 설정되어 있는지 확인
   - 다르면 업데이트

4. **같은 네트워크인지 확인**
   - 같은 네트워크(공유기)에 연결되어 있는지 확인
   - 외부 네트워크에서 접근하려면 공유기 포트 포워딩 필요

### 포트 포워딩 (외부 네트워크에서 접근 시)

공유기 설정에서:
- 포트 3000 → 서버 IP:3000
- 포트 3001 → 서버 IP:3001

