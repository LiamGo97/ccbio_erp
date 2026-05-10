# 판매 #1309 tb_feature_audit_log 분석 요약

## 1. 기본 정보

| 항목 | 값 |
|------|-----|
| 판매 ID | 1309 |
| 판매 상태 | COMPLETED |
| 판매일 | 2026-03-16 |
| 배송 ID | 661 |
| 배송 상태 | UNLOADING_COMPLETED |
| 운송번호 | AM-2603-0068 |
| 배차(vd_id) | 없음 |

---

## 2. 타임라인 (시간순)

| 시각 (UTC) | 엔티티 | 액션 | 요약 | 담당 |
|------------|--------|------|------|------|
| 2026-03-16 00:54:57 | sales | CREATED | 판매 등록 #1309 (항목 1건) | 고수민 |
| 2026-03-16 00:55:17 | sales_delivery | UPDATED | 배송 #661 PENDING_DISPATCH → DISPATCH_REQUESTED | 고수민 |
| 2026-03-16 00:55:59 | sales_delivery | UPDATED | 배송 #661 DISPATCH_REQUESTED → DISPATCHING | 고수민 |
| **2026-03-17 01:54:06** | **sales** | **UPDATED** | **판매 #1309 수정** (단가·비용 등) | 팀장 이병희 |
| 2026-03-17 02:01:06 | sales_delivery | UPDATED | 배송 #661 DISPATCHING → DISPATCH_COMPLETED | 팀장 이병희 |
| 2026-03-17 02:04:42 | sales_delivery | UPDATED | 배송 #661 수정 (차량번호 등) | 팀장 이병희 |
| 2026-03-17 02:05:31 | sales_delivery | UPDATED | 배송 #661 DISPATCH_COMPLETED → LOADING_COMPLETED | 팀장 이병희 |
| **2026-03-17 02:05:34** | **sales_delivery** | **UPDATED** | **배송 #661 LOADING_COMPLETED → UNLOADING_COMPLETED (하차완료)** | 팀장 이병희 |

---

## 3. 판매(sales) 변경 내용 (fal_id 2520, 2026-03-17 01:54:06)

- **담당:** 팀장 이병희  
- **변경 요약:**
  - 판매 항목(si_id 1808): `salesUnitPrice` **437 → 427**
  - 동일 항목: `dtCost` null→**0**, `stoCost` null→**0**, `advancePaymentRatio` null→**0**
  - `salesUnitPriceStage` 는 "LOADING" 유지  
- 이 시점에는 “판매 정보 수정”만 있고, 하차 관련 actual 반영은 없음.

---

## 4. 하차완료 시점 배송 #661 로그 (fal_id 2528)

- **시각:** 2026-03-17 02:05:34  
- **상태 변경:** LOADING_COMPLETED → **UNLOADING_COMPLETED**

### 4.1 하차완료 직전/직후 loadingItems (fal_old_data / fal_new_data)

| 필드 | old (LOADING_COMPLETED) | new (UNLOADING_COMPLETED) |
|------|-------------------------|----------------------------|
| loadingItems[0].id | 2403 | 2403 |
| loadingItems[0].salesItemId | 1808 | 1808 |
| loadingItems[0].status | **PENDING** | **PENDING** (변화 없음) |
| loadingItems[0].actualBL | **null** | **null** |
| loadingItems[0].actualContainer | **null** | **null** |
| loadingItems[0].actualBales | **null** | **null** |
| loadingItems[0].actualWeight | **null** | **null** |
| workBL / workContainer | SMLMPHX5B9460600, SMCU111643-9 | 동일 |

**결론:** 하차완료 처리 시 **actual\*** 값(BL, 컨테이너, 베일, 중량)이 전혀 저장되지 않았고, loadingItem 상태도 PENDING으로 유지됨.

---

## 5. LoadingItem ID 변경 (2299 → 2403)

- **00:55:17 / 00:55:59** 배송 로그: `loadingItems[0].id` = **2299**
- **02:04:42** “배송 #661 수정” 이후 **02:05:31 / 02:05:34** 로그: `loadingItems[0].id` = **2403**
- 동일 `salesItemId: 1808` 에 대해 상차 항목 ID만 2299 → 2403으로 바뀐 것으로 보임 (배송 수정 시 재저장/재생성 가능성).

---

## 6. BUGFIX 문서와의 연관 (하차완료 시 판매 항목 미반영)

`BUGFIX-하차완료-판매항목-미반영.md` 기준:

- **기대:** 하차완료 시  
  - `tb_sales_delivery_loading_item` 에 **actual\*** 저장  
  - **actual\*** → 해당 SalesItem(및 컨테이너/재고) 반영  

- **판매 #1309 / 배송 #661 실제:**
  - 하차완료 로그에서 **actualBL, actualContainer, actualBales, actualWeight** 가 모두 **null**.
  - 따라서 백엔드에서 `loadingItemsToApply`(actual* 중 하나라도 있는 항목)가 **0건**이 되어,  
    “하차완료 블록은 들어갔더라도 **반영 대상 0건**”으로 판매 항목 업데이트가 되지 않은 케이스에 해당함.

- **원인 후보 (문서 2번과 연관):**
  - **반영 대상 0건:** actual* 가 하나도 없으면 `loadingItemsToApply` 에 포함되지 않음.
  - 가능한 이유:
    - 하차완료 요청 시 **프론트에서 actual\*** (actualBL, actualContainer, actualBales, actualWeight) **를 보내지 않았거나**
    - 백엔드에서 **DTO와 DB LoadingItem id 매칭/병합 문제**로 actual* 가 비어 저장된 경우.

---

## 7. 입고(trade_order_inbound) 로그

- 판매 1309의 판매 항목은 컨테이너 **3203** (SMCU111643-9 등).
- 주문 367 입고 예정/확정 로그에 containerId 3203 포함, 입고 확정 단가 등 수정 이력 있음 (fal_id 1688, 1876, 2094, 2159).

---

## 8. 재발 방지·추적 시 확인할 것

1. **백엔드 로그**
   - `[하차완료 디버그] 조건 체크` – 블록 진입 여부  
   - `[하차완료 체크] LoadingItem 조회 - 전체: N개, 실제 반영 대상: M개` – **M=0** 여부  
   - `[하차완료-판매미반영] 실제 반영 대상 0건인데 DTO에는 actual* 값이 있음` – DTO vs DB 불일치 여부  

2. **프론트**
   - 하차완료 제출 시 **남은 loadingItem**을 `loadingItems` 에 포함해 보내는지.  
   - 해당 항목에 **actualContainer / actualContainerId / actualBales / actualWeight** 가 사용자 입력값으로 들어가는지.

3. **DB**
   - `tb_sales_delivery_loading_item` (sdli_id 2403) 에 actual* 컬럼이 현재도 null인지 확인하면, 당시 요청에 actual* 가 반영되지 않았음을 추가로 확인 가능.

---

## 9. 요약 표

| 구분 | 내용 |
|------|------|
| 판매 #1309 | 1건 등록, 1회 수정(단가·비용), 하차완료 후에도 “판매 정보” 쪽에는 actual 반영 없음 |
| 배송 #661 | PENDING_DISPATCH → … → LOADING_COMPLETED → UNLOADING_COMPLETED 정상 진행 |
| 하차완료 시 actual* | **전부 null** → 반영 대상 0건 → 판매 항목/상품 정보 미반영 |
| 다음 단계 | 하차완료(또는 수정) 요청 payload 에 actual* 포함 여부 및 백엔드 id 매칭·병합 로그 확인 권장 |

---

## 10. 원인 정리 및 대응 (추가)

- **프론트:** 하차완료 시 "모든 상차 행에 실제 BL·컨테이너" 필수 검증 있음 → BL/컨테이너 없으면 저장 불가.
- **백엔드:** actual* 미전달 시 **request\*/work\*** 로 채우는 fallback이 있으나, **DTO의 id ↔ DB LoadingItem id** 로만 매칭함.
- **추정 원인:** 배송 수정(02:04:42)으로 LoadingItem id가 2299→2403으로 바뀐 뒤, 하차완료 요청이 옛 id(2299)로 오면 `dtoByLoadingItemId.get('2403')` 가 undefined → 해당 행에 merge가 되지 않아 actual* 가 null로 남음.
- **적용한 수정:** ID로 DTO 매칭 실패한 DB 행에 대해서도 **request/work** 로 actual* 를 채우는 fallback 추가 (`sales-delivery.service.ts`). 이렇게 하면 id 불일치여도 판매 반영 대상에 포함될 수 있음.

이 문서는 `scripts/sales-audit-log-by-sales-id.sql` (sales_id=1309) 실행 결과와 `BUGFIX-하차완료-판매항목-미반영.md` 를 기준으로 작성됨.
