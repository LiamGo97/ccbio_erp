# Cloud SQL & Cloud Run 성능 최적화 가이드

## 문제 원인 분석

### 1. Cloud SQL 인스턴스 사양 부족
- **문제**: 가장 저렴한 티어(f1-micro, shared vCPU) 사용 시 CPU/메모리 부족
- **증상**: 연결 타임아웃, 느린 쿼리 응답, "connection pool exhausted" 에러
- **영향**: 트래픽이 적어도 간헐적으로 느려짐

### 2. Cloud Run 설정 미최적화
- **문제**: 최소 인스턴스 0, 콜드 스타트 발생
- **증상**: 첫 요청 시 5-10초 지연, DB 연결 실패
- **영향**: 사용자 경험 저하

### 3. 연결 풀 설정 문제
- **문제**: 애플리케이션 연결 수가 Cloud SQL 최대 연결 수를 초과
- **증상**: "remaining connection slots are reserved" 에러
- **영향**: 일부 요청 실패

### 4. 네트워크 연결 방식
- **문제**: Public IP 사용 시 네트워크 지연, Private IP 미설정
- **증상**: 연결 불안정, 느린 응답
- **영향**: 성능 저하

## 권장 해결 방법

### 1. Cloud SQL 인스턴스 사양 확인 및 업그레이드

#### 현재 사양 확인
```bash
gcloud sql instances describe [INSTANCE_NAME]
```

#### 최소 권장 사양
- **프로덕션**: 
  - **db-f1-micro** (공유 vCPU, 0.6GB RAM) - 최소 개발용
  - **db-g1-small** (1 vCPU, 1.7GB RAM) - 소규모 프로덕션 권장
  - **db-n1-standard-1** (1 vCPU, 3.75GB RAM) - 중규모 권장

#### 업그레이드 방법
```bash
# 인스턴스 사양 변경 (다운타임 최소화)
gcloud sql instances patch [INSTANCE_NAME] \
  --tier=db-g1-small

# 또는 더 높은 사양
gcloud sql instances patch [INSTANCE_NAME] \
  --tier=db-n1-standard-1
```

**비용 참고**: 
- f1-micro: 약 $7/월 (공유 vCPU)
- g1-small: 약 $25/월 (전용 vCPU)
- n1-standard-1: 약 $50/월

### 2. Cloud Run 설정 최적화

#### cloudbuild.yaml 또는 Cloud Run 설정에서:
```yaml
# 최소 인스턴스 설정 (콜드 스타트 방지)
min-instances: 1

# 최대 인스턴스 설정
max-instances: 10

# CPU 할당
cpu: 1  # 또는 2

# 메모리 할당
memory: 512Mi  # 또는 1Gi

# 타임아웃 설정
timeout: 60s  # 또는 300s (5분)

# 동시 요청 수
concurrency: 80  # 기본값, 필요시 조정
```

또는 gcloud CLI로:
```bash
gcloud run services update [SERVICE_NAME] \
  --min-instances=1 \
  --max-instances=10 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=60s \
  --concurrency=80
```

**비용 참고**: min-instances=1 설정 시 항상 실행되어 비용 발생 (최소 $5-10/월)

### 3. 연결 풀 설정 최적화

#### 현재 설정 (app.module.ts)
```typescript
extra: {
  max: 10,  // Cloud SQL 최대 연결 수의 80% 이하로 설정 권장
  min: 2,   // 최소 인스턴스가 1개일 때
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
}
```

#### Cloud SQL 최대 연결 수 확인
```bash
gcloud sql instances describe [INSTANCE_NAME] --format="value(settings.databaseFlags)"
```

일반적으로:
- f1-micro: 최대 25 연결
- g1-small: 최대 100 연결
- n1-standard-1: 최대 1000 연결

#### 권장 설정
- **f1-micro 사용 시**: `max: 5, min: 1`
- **g1-small 사용 시**: `max: 20, min: 2` (Cloud Run 인스턴스 1개 기준)
- **n1-standard-1 사용 시**: `max: 50, min: 5`

**계산 공식**: 
```
max 연결 수 = (Cloud SQL 최대 연결 수 / Cloud Run 최대 인스턴스 수) * 0.8
```

예: g1-small (100 연결), Cloud Run 최대 5개 인스턴스
- 최대 연결 수 = (100 / 5) * 0.8 = 16 (안전하게 20 권장)

### 4. 네트워크 연결 방식 최적화

#### Option A: Unix Socket 사용 (Cloud Run 권장)
**장점**: 가장 빠르고 안정적, Cloud SQL Proxy 자동 사용

환경 변수 설정:
```env
# Cloud Run 환경 변수
DATABASE_URL=postgresql://[USER]:[PASSWORD]@/[DB_NAME]?host=/cloudsql/[PROJECT_ID]:[REGION]:[INSTANCE_NAME]
```

또는:
```env
# Unix Socket 경로 사용
DATABASE_URL=postgresql://[USER]:[PASSWORD]@/[DB_NAME]?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME&sslmode=disable
```

#### Option B: Private IP 사용
**장점**: GCP 내부 네트워크, 빠른 속도

1. Cloud SQL 인스턴스에 Private IP 활성화
2. Cloud Run을 VPC 커넥터와 연결
3. 환경 변수에 Private IP 사용

#### Option C: Public IP (현재 사용 중일 가능성)
**단점**: 네트워크 지연, 불안정

최소한의 보안 설정:
- 승인된 네트워크 제한
- SSL 필수 (`sslmode=require`)

### 5. 추가 최적화 설정

#### Cloud SQL 인스턴스 플래그 설정
```bash
gcloud sql instances patch [INSTANCE_NAME] \
  --database-flags=max_connections=100,shared_buffers=256MB
```

#### 백엔드 코드 개선 (app.module.ts)
```typescript
extra: {
  max: process.env.NODE_ENV === 'production' ? 20 : 5,
  min: process.env.NODE_ENV === 'production' ? 2 : 1,
  idleTimeoutMillis: process.env.NODE_ENV === 'production' ? 30000 : 10000,
  connectionTimeoutMillis: 20000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // 연결 풀 모니터링
  statement_timeout: 30000, // 30초
  query_timeout: 30000,
  // 재연결 로직 개선
  pool: {
    afterCreate: (conn: any, done: any) => {
      conn.query('SET timezone = "Asia/Seoul"', done);
    },
  },
},
```

## 모니터링 및 디버깅

### 1. Cloud SQL 연결 수 모니터링
```bash
# Cloud SQL 인스턴스의 활성 연결 수 확인
gcloud sql instances describe [INSTANCE_NAME] \
  --format="value(settings.databaseFlags)"
```

### 2. Cloud Run 로그 확인
```bash
# 최근 에러 로그 확인
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit 50 \
  --format json
```

### 3. 연결 풀 상태 확인
백엔드에 헬스체크 엔드포인트 추가:
```typescript
// health.controller.ts
@Get('health/db')
async checkDatabase() {
  try {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', db: 'connected' };
  } catch (error) {
    return { status: 'error', db: 'disconnected', error: error.message };
  }
}
```

## 비용 최적화 팁

### 1. 최소 비용으로 성능 개선
- **Cloud SQL**: f1-micro → g1-small 업그레이드 (+$18/월)
- **Cloud Run**: min-instances=0 유지, CPU/Memory 최적화
- **예상 비용**: 기존 $7/월 → 개선 후 $25-30/월

### 2. 트래픽 패턴에 따른 설정
- **낮은 트래픽**: min-instances=0, 자동 스케일링
- **중간 트래픽**: min-instances=1, 콜드 스타트 방지
- **높은 트래픽**: min-instances=2-3, 더 높은 사양 필요

### 3. 예약 인스턴스 활용 (장기 사용 시)
- Cloud SQL 예약 인스턴스: 1년 약정 시 최대 30% 할인
- Cloud Run: 예약 없음 (사용량 기반)

## 체크리스트

### 즉시 적용 가능한 개선 사항
- [ ] Cloud SQL 인스턴스 사양 확인 (f1-micro → g1-small 권장)
- [ ] 연결 풀 `max` 값을 Cloud SQL 최대 연결 수의 80%로 조정
- [ ] Unix Socket 또는 Private IP 사용으로 전환
- [ ] Cloud Run min-instances=1 설정 (비용 허용 시)
- [ ] 타임아웃 설정 확인 및 조정

### 중기 개선 사항
- [ ] Cloud SQL 모니터링 알림 설정
- [ ] 백엔드 헬스체크 엔드포인트 추가
- [ ] 연결 풀 모니터링 대시보드 구축
- [ ] 쿼리 성능 최적화 (느린 쿼리 로깅)

### 장기 개선 사항
- [ ] 읽기 전용 복제본 추가 (읽기 쿼리 분산)
- [ ] Connection Pooler 사용 (PgBouncer 등)
- [ ] 캐싱 레이어 추가 (Redis 등)
- [ ] 데이터베이스 인덱스 최적화

## 참고 문서
- [Cloud SQL 사양 및 가격](https://cloud.google.com/sql/pricing)
- [Cloud Run 성능 최적화](https://cloud.google.com/run/docs/tips)
- [PostgreSQL 연결 풀링](https://www.postgresql.org/docs/current/runtime-config-connection.html)

