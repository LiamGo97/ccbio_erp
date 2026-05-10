# 재고 조정 기능 체크리스트

## ✅ 1. 재고 추가 (INBOUND)

### API
- **엔드포인트**: `POST /trade/contracts/containers/:containerId/adjust-inventory`
- **Controller**: `TradeContractsController.adjustContainerInventory`
- **Service**: `TradeContractsService.adjustContainerInventory`

### 구현 상태
- ✅ 컨테이너 조회
- ✅ 베일/중량 증가 로직
- ✅ 컨테이너 저장
- ✅ 재고 상태 재계산 (`updateContainerInventoryStatusAfterSalesChange`)

### 처리 흐름
1. 컨테이너 조회
2. 현재 베일/중량 + 입력값 = 새로운 베일/중량
3. 컨테이너 업데이트
4. 재고 상태 재계산 (판매 수량은 변하지 않았으므로 가용 수량 증가)

---

## ✅ 2. 재고 소모 (CONSUMPTION)

### API
- **엔드포인트**: `POST /trade/contracts/containers/:containerId/adjust-inventory`
- **Controller**: `TradeContractsController.adjustContainerInventory`
- **Service**: `TradeContractsService.adjustContainerInventory`

### 구현 상태
- ✅ 컨테이너 조회
- ✅ 가상 판매 생성 (고객 없음)
- ✅ 판매 항목 생성 (`SALES_ITEM_COMPLETED` 상태)
- ✅ 재고 상태 재계산 (`updateContainerInventoryStatusAfterSalesChange`)

### 처리 흐름
1. 컨테이너 조회
2. 가상 판매 생성 (`customerId: null`)
3. 판매 항목 생성 (베일/중량 입력값 사용)
4. 재고 상태 재계산 (판매 수량 증가 → 가용 수량 감소)

### 주의사항
- 프론트엔드에서 `salesUnitPrice`, `stoCost`, `dtCost`를 보내지 않으므로 `null`로 저장됨
- 이는 의도된 동작 (재고 조정은 수량만 관리)

---

## ✅ 3. 판매 항목 수정

### API
- **엔드포인트**: `PUT /sales/items/:id`
- **Controller**: `SalesController.updateSalesItem`
- **Service**: `SalesService.updateSalesItem`

### 구현 상태
- ✅ 판매 항목 조회 (관계 포함)
- ✅ 재고 조정 항목 확인 (고객이 없는 경우만 수정 가능)
- ✅ 베일/중량 수정
- ✅ 판매 항목 저장
- ✅ 재고 상태 재계산 (`updateContainerInventoryStatus`)

### 처리 흐름
1. 판매 항목 조회 (sales, customer, container 관계 포함)
2. 고객이 있는지 확인 (있으면 오류)
3. 베일/중량 수정
4. 재고 상태 재계산

---

## ✅ 4. 판매 항목 삭제

### API
- **엔드포인트**: `DELETE /sales/items/:id`
- **Controller**: `SalesController.deleteSalesItem`
- **Service**: `SalesService.deleteSalesItem`

### 구현 상태
- ✅ 판매 항목 조회 (관계 포함)
- ✅ 재고 조정 항목 확인 (고객이 없는 경우만 삭제 가능)
- ✅ 상태를 `SALES_ITEM_CANCELLED`로 변경
- ✅ 판매에 다른 항목이 없으면 판매도 삭제
- ✅ 재고 상태 재계산 (`updateContainerInventoryStatus`)

### 처리 흐름
1. 판매 항목 조회 (sales, customer, sales.items, container 관계 포함)
2. 고객이 있는지 확인 (있으면 오류)
3. 상태를 `SALES_ITEM_CANCELLED`로 변경
4. 판매에 다른 항목이 있는지 확인
5. 다른 항목이 없으면 판매도 삭제
6. 재고 상태 재계산

---

## ✅ 5. 불러오기 (조회)

### API
- **엔드포인트**: `GET /trade/contracts/containers/:containerId`
- **Controller**: `TradeContractsController.getContainer`
- **Service**: `TradeContractsService.getContainer`

### 구현 상태
- ✅ 컨테이너 조회 (관계 포함)
- ✅ 판매 이력 조회 (취소된 항목 제외)
- ✅ 코드 정보 조회 및 매핑
- ✅ 컨테이너 정보 변환
- ✅ 판매 이력 데이터 변환

### 반환 데이터
- **container**: 컨테이너 기본 정보 (베일, 중량, 제품, 등급, 원가, 재고 상태 등)
- **salesHistory**: 판매 이력 배열 (고객 정보, 판매 수량, 상태 등)

---

## 재고 상태 재계산 로직

### `updateContainerInventoryStatusAfterSalesChange` (TradeContractsService)
- ✅ 컨테이너 조회
- ✅ 판매 항목 조회 (취소 제외)
- ✅ 판매 수량 계산 (CONTAINER/CARGO 타입별 처리)
- ✅ 가용 수량 계산 (원래 수량 - 판매 수량)
- ✅ 재고 상태 결정 (AVAILABLE, RESERVED, PARTIALLY_RESERVED, PARTIALLY_SOLD, PARTIALLY_SOLD_COMPLETED, SELLING, SOLD_OUT)
- ✅ 재고 상태 업데이트

### `updateContainerInventoryStatus` (SalesService)
- ✅ 동일한 로직으로 재고 상태 재계산
- ✅ 트랜잭션 내에서 실행

---

## 보안 및 검증

### ✅ 재고 조정 항목만 수정/삭제 가능
- `updateSalesItem`: `salesItem.sales?.customerId != null` 체크
- `deleteSalesItem`: `salesItem.sales?.customerId != null` 체크
- 고객이 있는 경우 `BadRequestException` 발생

### ✅ 입력값 검증
- `AdjustContainerInventoryDto`: `@IsEnum`, `@IsNumber`, `@Min(0)` 검증
- `UpdateSalesItemDto`: `@IsNumber`, `@Min(-999999)` 검증 (재고 입고 INVENTORY_INBOUND는 음수 허용)

---

## 결론

**모든 기능이 백엔드에서 완전히 구현되어 있습니다:**

1. ✅ **재고 추가 (INBOUND)**: 베일/중량 증가, 재고 상태 재계산
2. ✅ **재고 소모 (CONSUMPTION)**: 가상 판매 이력 생성, 재고 상태 재계산
3. ✅ **판매 항목 수정**: 재고 조정 항목만 수정 가능, 재고 상태 재계산
4. ✅ **판매 항목 삭제**: 재고 조정 항목만 삭제 가능, 재고 상태 재계산
5. ✅ **불러오기 (조회)**: 컨테이너 정보 + 판매 이력 조회

모든 API 엔드포인트가 컨트롤러에 등록되어 있고, 서비스 메서드도 완전히 구현되어 있습니다.
