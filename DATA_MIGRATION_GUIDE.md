# 데이터베이스 이전 가이드

## 방법 1: pgAdmin 백업/복원 (가장 권장) ⭐

### 1-1. 원본 데이터베이스 백업

1. **pgAdmin에서 원본 데이터베이스 연결**
2. **데이터베이스 우클릭** → **Backup...**
3. **설정**:
   - **Filename**: `ccbio_erp_backup.dump` (또는 원하는 이름)
   - **Format**: **Custom** (권장) 또는 **Plain**
   - **Encoding**: **UTF8**
   - **Role name**: 데이터베이스 소유자 (보통 postgres)
4. **Backup** 버튼 클릭

### 1-2. 대상 데이터베이스 복원

1. **pgAdmin에서 대상 데이터베이스 연결**
2. **데이터베이스 우클릭** → **Restore...**
3. **설정**:
   - **Filename**: 백업한 `.dump` 파일 선택
   - **Format**: **Custom** (또는 Plain)
   - **Role name**: 대상 데이터베이스 소유자
4. **Restore** 버튼 클릭

**장점**:
- ✅ 스키마, 데이터, 인덱스, 제약조건 모두 포함
- ✅ GUI로 간단하게 작업 가능
- ✅ 외래키, 시퀀스 등 모든 객체 자동 처리

---

## 특정 테이블만 이전하기 🎯

### 방법 A: pgAdmin에서 특정 테이블 백업/복원

#### 1. 특정 테이블 백업
1. **pgAdmin에서 원본 데이터베이스 연결**
2. **Schemas** → **public** → **Tables** 확장
3. **원하는 테이블 우클릭** → **Backup...**
4. **설정**:
   - **Filename**: `테이블명_backup.dump` (예: `tb_code_backup.dump`)
   - **Format**: **Custom** 또는 **Plain**
   - **Encoding**: **UTF8**
5. **Backup** 버튼 클릭

#### 2. 특정 테이블 복원
1. **pgAdmin에서 대상 데이터베이스 연결**
2. **데이터베이스 우클릭** → **Restore...**
3. **설정**:
   - **Filename**: 백업한 `.dump` 파일 선택
   - **Format**: **Custom** (또는 Plain)
   - **Options** 탭에서:
     - **Pre-data**: 체크 (스키마 포함)
     - **Data**: 체크 (데이터 포함)
     - **Post-data**: 체크 (인덱스, 제약조건 포함)
4. **Restore** 버튼 클릭

### 방법 B: pg_dump로 특정 테이블만 덤프

```bash
# 특정 테이블 하나만 덤프
pg_dump -h localhost -U postgres -d ccbio_erp -t 테이블명 -F c -f 테이블명_backup.dump

# 예시: tb_code 테이블만
pg_dump -h localhost -U postgres -d ccbio_erp -t tb_code -F c -f tb_code_backup.dump

# 여러 테이블 지정 (공백으로 구분)
pg_dump -h localhost -U postgres -d ccbio_erp -t tb_code -t tb_cate -F c -f tables_backup.dump

# SQL 형식으로
pg_dump -h localhost -U postgres -d ccbio_erp -t tb_code -f tb_code_backup.sql
```

### 방법 C: 특정 테이블 복원

```bash
# Custom 형식 복원
pg_restore -h 대상호스트 -U 사용자명 -d ccbio_erp -v 테이블명_backup.dump

# SQL 형식 복원
psql -h 대상호스트 -U 사용자명 -d ccbio_erp -f 테이블명_backup.sql

# 기존 테이블이 있으면 덮어쓰기 (주의: 기존 데이터 삭제됨)
pg_restore -h localhost -U ccbio_user -d ccbio_erp --clean --if-exists -v tb_code_backup.dump
```

**옵션 설명**:
- `-t 테이블명`: 특정 테이블만 지정
- `--clean`: 복원 전에 기존 객체 삭제
- `--if-exists`: 객체가 없어도 오류 없이 진행

### 방법 D: CSV로 특정 테이블만 (간단한 경우)

**특정 테이블만 옮길 때는 CSV도 사용 가능합니다!**

#### 1. Export (원본)
1. **pgAdmin에서 테이블 우클릭** → **Export/Import Data...**
2. **Export 탭**:
   - **Filename**: `테이블명.csv`
   - **Format**: **CSV**
   - **Options**:
     - ✅ **Header**: 체크 (컬럼명 포함)
     - ✅ **Quote**: 체크 (특수문자 처리)
     - **Delimiter**: `,` (쉼표)
     - **Encoding**: **UTF8**
3. **OK** 클릭

#### 2. Import (대상)
1. **대상 데이터베이스에서 테이블이 이미 생성되어 있어야 함**
2. **pgAdmin에서 테이블 우클릭** → **Export/Import Data...**
3. **Import 탭**:
   - **Filename**: Export한 `.csv` 파일 선택
   - **Format**: **CSV**
   - **Options**:
     - ✅ **Header**: 체크
     - **Delimiter**: `,`
     - **Encoding**: **UTF8**
4. **OK** 클릭

**주의사항**:
- ⚠️ 테이블 스키마는 별도로 생성해야 함
- ⚠️ 외래키 제약조건은 Import 후 수동 설정
- ⚠️ 시퀀스 값은 수동 조정 필요

---

## 방법 2: pg_dump/pg_restore (명령줄)

### 2-1. 원본 데이터베이스 덤프

```bash
# Custom 형식 (권장 - 빠르고 압축됨)
pg_dump -h 원본호스트 -U 사용자명 -d ccbio_erp -F c -f ccbio_erp_backup.dump

# 예시 (로컬)
pg_dump -h localhost -U postgres -d ccbio_erp -F c -f ccbio_erp_backup.dump

# SQL 형식 (텍스트 파일, 읽을 수 있음)
pg_dump -h localhost -U postgres -d ccbio_erp -f ccbio_erp_backup.sql
```

### 2-2. 대상 데이터베이스 복원

```bash
# Custom 형식 복원
pg_restore -h 대상호스트 -U 사용자명 -d ccbio_erp -v ccbio_erp_backup.dump

# 예시 (Cloud SQL Proxy 사용 시)
pg_restore -h localhost -U ccbio_user -d ccbio_erp -v ccbio_erp_backup.dump

# SQL 형식 복원
psql -h 대상호스트 -U 사용자명 -d ccbio_erp -f ccbio_erp_backup.sql
```

**옵션 설명**:
- `-F c`: Custom 형식 (바이너리, 압축됨)
- `-F p`: Plain 형식 (SQL 텍스트)
- `-v`: 상세 로그 출력
- `-f`: 출력 파일명

---

## 방법 3: CSV Export/Import (비권장 ❌)

### 왜 비권장인가?

1. **스키마 정보 손실**: 테이블 구조, 인덱스, 제약조건이 없음
2. **수동 작업 필요**: 각 테이블마다 Export/Import 반복
3. **외래키 문제**: 관계가 깨질 수 있음
4. **시퀀스 문제**: AUTO_INCREMENT 값이 맞지 않을 수 있음
5. **데이터 타입 변환**: 날짜, JSON 등 복잡한 타입 처리 어려움

### CSV를 꼭 사용해야 한다면

1. **테이블별 Export**:
   - pgAdmin에서 테이블 우클릭 → **Export/Import Data...**
   - Format: **CSV**
   - Options: **Header** 체크

2. **Import 시 주의사항**:
   - 테이블이 이미 생성되어 있어야 함
   - 컬럼 순서가 정확해야 함
   - 외래키는 임시로 비활성화 후 Import
   - 시퀀스는 수동으로 조정 필요

---

## Cloud SQL로 이전하는 경우

### Cloud SQL Proxy 사용 시

```bash
# 1. Cloud SQL Proxy 실행
./cloud-sql-proxy "프로젝트ID:리전:인스턴스명" --port=5432

# 2. 덤프 복원 (다른 터미널에서)
pg_restore -h localhost -U ccbio_user -d ccbio_erp -v ccbio_erp_backup.dump
```

### Public IP 사용 시

```bash
# 덤프 복원
pg_restore -h PUBLIC_IP -U ccbio_user -d ccbio_erp -v ccbio_erp_backup.dump
```

---

## 체크리스트

이전 전:
- [ ] 원본 데이터베이스 백업 완료
- [ ] 대상 데이터베이스가 비어있거나 덮어써도 되는지 확인
- [ ] 연결 정보 확인 (호스트, 포트, 사용자명, 비밀번호)

이전 후:
- [ ] 테이블 개수 확인
- [ ] 데이터 개수 샘플 확인
- [ ] 외래키 제약조건 확인
- [ ] 시퀀스 값 확인
- [ ] 애플리케이션 연결 테스트

---

## 문제 해결

### "permission denied" 오류
- 데이터베이스 소유자 권한 확인
- `-U` 옵션에 올바른 사용자명 사용

### "relation already exists" 오류
- 대상 데이터베이스에 기존 테이블이 있는 경우
- `--clean` 옵션 사용 (주의: 기존 데이터 삭제됨)
- 또는 대상 데이터베이스 초기화 후 재시도

### "connection refused" 오류
- 호스트/포트 확인
- 방화벽 설정 확인
- Cloud SQL Proxy 실행 여부 확인

