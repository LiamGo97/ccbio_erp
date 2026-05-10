# GCP Cloud SQL 연동 가이드

## 1. Cloud SQL 인스턴스 설정 확인

### 인스턴스 정보 확인
GCP Console에서 다음 정보를 확인하세요:
- **인스턴스 연결 이름**: `프로젝트ID:리전:인스턴스명` (예: `my-project:asia-northeast3:ccbio-db`)
- **Public IP 주소** (Public IP 사용 시)
- **Private IP 주소** (Private IP 사용 시)
- **데이터베이스 버전**: PostgreSQL 버전

## 2. 데이터베이스 및 사용자 생성

### 방법 1: GCP Console에서 생성
1. Cloud SQL 인스턴스 페이지로 이동
2. "데이터베이스" 탭에서 데이터베이스 생성:
   - 데이터베이스 이름: `ccbio_erp`
3. "사용자" 탭에서 사용자 생성:
   - 사용자 이름: `ccbio_user` (또는 원하는 이름)
   - 비밀번호: 강력한 비밀번호 설정

### 방법 2: gcloud CLI로 생성
```bash
# 데이터베이스 생성
gcloud sql databases create ccbio_erp --instance=인스턴스명

# 사용자 생성
gcloud sql users create ccbio_user \
  --instance=인스턴스명 \
  --password=비밀번호
```

## 3. 연결 방법 선택

### 옵션 A: Cloud SQL Proxy 사용 (권장 - 로컬 개발)
가장 안전하고 간단한 방법입니다.

#### 3-1. Cloud SQL Proxy 설치
```bash
# macOS
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.arm64
chmod +x cloud-sql-proxy

# Linux
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# Windows (PowerShell)
Invoke-WebRequest -Uri "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.x64.exe" -OutFile "cloud-sql-proxy.exe"
```

#### 3-2. 인증 설정
```bash
# GCP 인증 (처음 한 번만)
gcloud auth application-default login
```

#### 3-3. Cloud SQL Proxy 실행
```bash
# 인스턴스 연결 이름을 사용
./cloud-sql-proxy "프로젝트ID:리전:인스턴스명" --port=5432

# 예시:
# ./cloud-sql-proxy "my-project:asia-northeast3:ccbio-db" --port=5432
```

#### 3-4. 백엔드 .env 설정
```env
# Cloud SQL Proxy를 통해 연결 (로컬에서 실행 중인 경우)
DATABASE_URL=postgresql://ccbio_user:비밀번호@localhost:5432/ccbio_erp
```

### 옵션 B: Public IP 직접 연결 (간단하지만 보안 주의)
#### 3-1. 인스턴스에 Public IP 활성화
1. Cloud SQL 인스턴스 페이지
2. "연결" 탭
3. "공개 IP" 섹션에서 "공개 IP 주소 추가" 클릭

#### 3-2. 승인된 네트워크 설정
1. "연결" 탭의 "승인된 네트워크" 섹션
2. "네트워크 추가" 클릭
3. 현재 IP 주소 추가 (또는 `0.0.0.0/0` - 모든 IP 허용, 보안상 권장하지 않음)

#### 3-3. 백엔드 .env 설정
```env
# Public IP로 직접 연결
DATABASE_URL=postgresql://ccbio_user:비밀번호@PUBLIC_IP:5432/ccbio_erp

# 예시:
# DATABASE_URL=postgresql://ccbio_user:mypassword@34.64.123.45:5432/ccbio_erp
```

### 옵션 C: Private IP (GCP 내부 리소스에서만 접근 가능)
GCP VM이나 Cloud Run 등에서 실행할 때 사용합니다.

```env
# Private IP로 연결 (GCP 내부 리소스에서만)
DATABASE_URL=postgresql://ccbio_user:비밀번호@PRIVATE_IP:5432/ccbio_erp
```

## 4. 로컬 데이터베이스 마이그레이션

### 4-1. 로컬 데이터베이스 덤프
```bash
# 로컬 PostgreSQL에서 덤프 생성
pg_dump -h localhost -U postgres -d ccbio_erp -F c -f ccbio_erp_backup.dump

# 또는 SQL 형식으로
pg_dump -h localhost -U postgres -d ccbio_erp -f ccbio_erp_backup.sql
```

### 4-2. Cloud SQL로 데이터 복원

#### Cloud SQL Proxy 사용 중인 경우:
```bash
# 덤프 복원
pg_restore -h localhost -U ccbio_user -d ccbio_erp -v ccbio_erp_backup.dump

# 또는 SQL 파일인 경우
psql -h localhost -U ccbio_user -d ccbio_erp -f ccbio_erp_backup.sql
```

#### Public IP 사용 중인 경우:
```bash
# 덤프 복원
pg_restore -h PUBLIC_IP -U ccbio_user -d ccbio_erp -v ccbio_erp_backup.dump

# 또는 SQL 파일인 경우
psql -h PUBLIC_IP -U ccbio_user -d ccbio_erp -f ccbio_erp_backup.sql
```

### 4-3. 마이그레이션 스크립트 실행
```bash
cd backend
# 기존 마이그레이션 스크립트 실행
node scripts/apply-address-migrations.js
# 또는 다른 마이그레이션 스크립트들 실행
```

## 5. 연결 테스트

### 5-1. 백엔드 서버 실행
```bash
cd backend
yarn start:dev
```

### 5-2. 연결 확인
- 백엔드 로그에서 데이터베이스 연결 성공 메시지 확인
- API 엔드포인트 테스트

## 6. SSL 연결 (선택사항, 권장)

Cloud SQL은 기본적으로 SSL 연결을 권장합니다.

### 6-1. SSL 인증서 다운로드
```bash
# Cloud SQL 인증서 다운로드
wget https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.arm64
```

### 6-2. DATABASE_URL에 SSL 옵션 추가
```env
DATABASE_URL=postgresql://ccbio_user:비밀번호@localhost:5432/ccbio_erp?sslmode=require
```

## 7. 프로덕션 환경 설정

### Cloud Run / App Engine에서 실행 시:
```env
# Private IP 사용 (GCP 내부)
DATABASE_URL=postgresql://ccbio_user:비밀번호@PRIVATE_IP:5432/ccbio_erp?sslmode=require

# 또는 Unix 소켓 사용 (Cloud Run 권장)
DATABASE_URL=postgresql://ccbio_user:비밀번호@/ccbio_erp?host=/cloudsql/프로젝트ID:리전:인스턴스명
```

## 문제 해결

### 연결 오류
1. **인증 오류**: 사용자 이름/비밀번호 확인
2. **네트워크 오류**: Public IP 사용 시 승인된 네트워크 확인
3. **타임아웃**: 방화벽 규칙 확인

### SSL 오류
- `sslmode=disable`로 임시 테스트 (프로덕션에서는 권장하지 않음)
- 또는 Cloud SQL Proxy 사용 (자동으로 SSL 처리)

### 마이그레이션 오류
- 기존 테이블이 있는지 확인
- 마이그레이션 순서 확인
- 필요시 데이터베이스 초기화 후 재시도

