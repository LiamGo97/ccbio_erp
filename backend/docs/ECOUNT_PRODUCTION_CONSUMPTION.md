# 이카운트 ERP "생산소모" 기능 설명

## 생산소모란?

**생산소모**는 이카운트 ERP에서 재고를 차감하는 기능입니다. 실제 판매나 출고가 아닌, 재고를 소모 처리하여 재고 수량을 줄이는 작업입니다.

### 주요 용도

1. **기초재고 정리**: 새로운 회계 기간이 시작될 때 기존 재고를 소진 처리
2. **재고 초기화**: 특정 시점 이전의 재고를 모두 소모 처리하여 재고를 0으로 만듦
3. **재고 조정**: 실제 재고와 시스템 재고가 다를 때 차이를 소모 처리
4. **폐기/손실 처리**: 손상되거나 폐기된 재고를 소모 처리

## 현재 시스템에서의 처리 방법

현재 시스템에는 이카운트 ERP와 직접 연동된 "생산소모" 기능이 구현되어 있지 않습니다. 대신 다음과 같은 방법으로 처리할 수 있습니다:

### 방법 1: 재고 상태만 변경 (간단)

2월 1일 이전의 모든 재고를 `SOLD_OUT` 상태로 변경합니다.

**장점:**
- 간단하고 빠름
- 데이터 변경 최소화

**단점:**
- 실제 판매 이력이 남지 않음
- 재고 소모 내역 추적 불가

**SQL 스크립트:**
```sql
-- backend/migrations/consume-old-inventory-before-feb-2025.sql 참고
UPDATE tb_container
SET co_inventory_status = 'SOLD_OUT'
WHERE co_inventory_status IN ('AVAILABLE', 'RESERVED', 'PARTIALLY_RESERVED', 'PARTIALLY_SOLD', 'SELLING')
  AND co_id NOT IN (
    SELECT DISTINCT si.co_id
    FROM tb_sales_item si
    INNER JOIN tb_sales s ON si.sa_id = s.sa_id
    WHERE s.sa_created_at >= '2025-02-01 00:00:00'
      AND si.si_status != 'SALES_ITEM_CANCELLED'
  );
```

### 방법 2: 가상 판매 항목 생성 (권장)

2월 1일 이전 재고를 소모하기 위해 가상의 판매 항목을 생성합니다.

**장점:**
- 실제 판매 이력이 남음
- 재고 소모 내역 추적 가능
- 재고 계산이 정확함

**단점:**
- 데이터가 증가함
- 복잡함

**처리 순서:**
1. 가상 판매 생성 (고객 없음, 날짜: 2025-01-31)
2. 각 컨테이너별로 가상 판매 항목 생성
3. 재고 상태 자동 업데이트

### 방법 3: 이카운트 ERP에서 직접 처리

이카운트 ERP에서 "생산소모" 기능을 사용하여 재고를 차감한 후, 현재 시스템과 동기화합니다.

**처리 순서:**
1. 이카운트 ERP에서 생산소모 처리
2. 현재 시스템의 재고 상태 확인
3. 필요시 수동으로 재고 상태 업데이트

## 권장 방법

**2월 1일부터 새로운 판매를 입력하는 경우:**

1. **백업 먼저**: 데이터 초기화 전에 반드시 백업
2. **재고 상태 변경**: 방법 1 사용 (간단하고 빠름)
3. **필요시 가상 판매**: 나중에 재고 소모 내역이 필요하면 방법 2 사용

## 주의사항

1. **백업 필수**: 재고 소모 처리 전에 반드시 데이터 백업
2. **날짜 확인**: 2월 1일 이후 판매가 연결된 컨테이너는 제외
3. **재고 상태 확인**: 처리 후 재고 상태를 확인하여 정상 처리되었는지 검증

## 재고 상태 종류

- `AVAILABLE`: 가용 재고
- `RESERVED`: 예약된 재고
- `PARTIALLY_RESERVED`: 부분 예약
- `PARTIALLY_SOLD`: 부분 판매
- `PARTIALLY_SOLD_COMPLETED`: 부분 판매 완료
- `SELLING`: 판매 중
- `SOLD_OUT`: 판매 완료 (재고 소모)

## SQL 스크립트 실행

```bash
# Cloud SQL Proxy 실행 중인 상태에서
psql -h localhost -U postgres -d ccbio_erp -f backend/migrations/consume-old-inventory-before-feb-2025.sql
```

또는 GCP Console에서 직접 실행할 수 있습니다.
