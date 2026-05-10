# 하차완료 시 판매 항목 미반영 버그 - 원인 및 대응

## 현상
- 판매 2건, 운송(상차) 2건인데 상차업체가 1건으로 처리함.
- 하차완료 시 컨테이너 1개 삭제하고, 남은 1건의 실제 정보(컨테이너/베일/중량)만 수정해서 저장.
- **배송관리 상세(우측)** 에는 수정한 내용이 맞게 보이지만, **판매 정보·상품 정보(좌측)** 는 이전 값 그대로임.

## 기대 동작
하차완료(또는 하차정보 수정) 시:
1. `tb_sales_delivery_loading_item` 에 실제(actual*) 값 저장
2. 행 삭제 시 해당 LoadingItem 삭제 + 연결된 SalesItem `SALES_ITEM_CANCELLED` 처리
3. **남은 LoadingItem의 actual\*** → **해당 SalesItem + 컨테이너/재고** 에 반영 (판매 항목/상품 정보가 실제와 일치해야 함)

## 원인 후보 (우선순위)

**※ 실제 BL·컨테이너를 화면에서 설정했는데도 판매 항목이 안 바뀌는 경우**  
→ “값이 없어서 반영 대상에서 빠졌다”는 가설이 아님. 아래 1, 2, 4, 5 중 하나일 가능성이 큼.

### 1. 하차완료 블록 미진입
- `willEnterUnloadingBlock` 이 false 이면 판매 반영 로직 자체를 타지 않음.
- 조건: `(isFirstUnloadingComplete || isUnloadingInfoEdit || hasRemovedLoadingItemsToCancel) && delivery.salesId`
- **행만 삭제하고 `loadingItems` 를 안 보내면** `isUnloadingInfoEdit` 가 false 가 되고, `hasRemovedLoadingItemsToCancel` 만 true 로 진입.
- 프론트는 행 삭제 시에도 `loadingItems`(남은 1건) 를 함께 보내므로, 정상이면 진입해야 함.  
  → 로그 `[하차완료 디버그] 조건 체크` / `판매 상태 변경 블록 미진입` 확인.

### 2. 반영 대상 0건 (loadingItemsToApply) — **실제로 BL/컨테이너 넣었으면 해당 없을 수 있음**
- `loadingItemsToApply` = DB에서 조회한 LoadingItem 중 `actualBL | actualContainer | actualBales | actualWeight` 중 하나라도 있는 것.
- **실제로 BL·컨테이너를 설정했다면** 보통 여기서 빠지지 않음. 다만 아래처럼 **백엔드에서 DTO가 병합되지 않으면** actual* 가 비어 있어서 빠질 수 있음.
- 가능 원인:
  - DTO의 `loadingItems` 와 DB의 LoadingItem **id 매칭 실패** (병합 시 해당 항목이 빠짐)
  - 프론트에서 남은 1건을 `loadingItems` 에 넣지 않거나, id를 잘못 보냄
- **대응:** `[하차완료-판매미반영] 실제 반영 대상 0건인데 DTO에는 actual* 값이 있음` 로그. 이 로그가 나오면 id 매칭 또는 payload 검토.

### 3. actualContainer 없을 때 과거 동작(스킵) 해석
- 과거에는 “actualContainerNo 가 없으면 베일/중량 업데이트 블록을 건너뜀” 이라는 로그가 있었음.
- 코드상 **베일/중량/타입 업데이트는 actualContainerNo 블록 바깥**에 있어서, actualContainer 유무와 관계없이 actualBales/actualWeight/actualType 이 있으면 판매 항목에 반영되는 구조임.
- 즉, “컨테이너만 없고 베일/중량은 있는 경우” 도 판매 항목에는 반영되어야 함.  
  → 로그만 정리했고, 동작은 유지.

### 4. 실제 컨테이너 DB 조회 실패 (BL·컨테이너는 넣었는데 반영 안 됨)
- **실제 BL·컨테이너를 설정했는데도** 판매 항목이 안 바뀌는 경우, 여기가 원인일 수 있음.
- 백엔드는 `actualContainerNo` 로 DB에서 컨테이너를 찾음. **같은 Order 내** → 못 찾으면 **전체 검색**.
- 다음이면 조회 실패로 **SalesItem 컨테이너/재고 반영이 스킵**됨 (베일/중량은 별도 블록이라 반영될 수 있음).
  - **컨테이너 번호 형식 불일치:** UI 표시는 `FFAU2723995 [2]` 처럼 순번이 붙는데, DB `co_container_no` 는 `FFAU2723995` 만 저장. 프론트가 `FFAU2723995 [2]` 를 그대로 보내면 `findOne({ containerNo: 'FFAU2723995 [2]' })` 가 실패할 수 있음. → **실제 저장/전송 시 `actualContainerId` 또는 순번 제거한 containerNo 만 보내는지 확인.**
  - 해당 컨테이너가 다른 Order 에만 있어서 “같은 Order” 검색 실패 후, 전체 검색도 실패(오타 등)
- 로그: `[실제 컨테이너 찾기 실패]` / `[판매 관리 - 컨테이너 업데이트 실패]` 확인.

### 5. 기타 (블록은 타는데 SalesItem update 미호출)
- `loadingItemsToApply` 에 들어가고, 컨테이너도 찾았는데 `hasAnyUpdate` 가 false 로 남는 경우(요청과 실제가 같다고 판단) 등.  
  → `[하차완료] [판매 관리 - SalesItem 업데이트 실행]` 로그가 찍히는지로 판단.

## 적용한 수정 사항
1. **진단 로그**
   - `loadingItemsToApply.length === 0` 이면서 DTO 에는 actual* 가 있는 경우  
     `[하차완료-판매미반영]` 경고 로그 출력 (원인 2 추적용).
2. **로그 문구 정리**
   - “actualContainerNo가 없어 베일/중량 업데이트 블록을 건너뜀” 문구를,  
     “actualContainerNo 없음. 베일/중량은 아래 블록에서 actual* 있으면 별도 반영함” 으로 변경해, 실제 동작과 맞게 수정.

## 재현 시 확인할 로그 (백엔드)
- `[하차완료 디버그] update() 진입` – payload 요약
- `[하차완료 디버그] 조건 체크` – 블록 진입 여부
- `[하차완료-Diff]` – toUpdate / toDelete / toAdd 개수, id 목록
- `[하차완료 체크] LoadingItem 조회 - 전체: N개, 실제 반영 대상: M개`
- `[하차완료-판매미반영]` – 반영 0건인데 DTO 에 actual* 있는 경우
- `[하차완료] [판매 관리 - SalesItem 업데이트 실행]` – 실제로 SalesItem update 호출 여부

## 프론트 확인 포인트
- 하차완료(또는 수정) 제출 시 **삭제한 행 id** 는 `removedLoadingItemIds` 만 보내지 말고, **남은 1건 전체**를 `loadingItems` 에 포함해 보내는지.
- `loadingItems` 의 그 1건에 `actualContainer` / `actualContainerId` / `actualBales` / `actualWeight` 가 사용자가 입력한 값으로 들어가는지 (특히 `actualApplyItems` → payload 매핑).

이후 동일 현상 재발 시 위 로그와 payload 를 남기면 원인 좁히기 쉬움.
