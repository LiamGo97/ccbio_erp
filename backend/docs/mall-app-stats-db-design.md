# 쇼핑몰·앱 통계 DB 설계 (단일 테이블)

## 요약

**테이블 하나**: 날짜 + 8가지 입력항목만 저장. 전주/금주·누적 등 모든 통계는 이 테이블을 조회·집계해서 구한다.

| 테이블 | 용도 |
|--------|------|
| **tb_mall_daily_stat** | 일별 1행, 8가지 지표. 일별 데이터 관리(CRUD) + 대시보드(기간 SUM/집계) |

- **대시보드**: 기간 필터 후 SUM → 전주/금주 비교, 일별 breakdown, 누적 판매 등 모두 이 테이블에서 계산.
- **일별 데이터 관리**: 이 테이블만 입력/수정/삭제.

---

## 1. 테이블 하나 — `tb_mall_daily_stat`

**날짜 + 8가지 입력항목** (이미지의 일별 컬럼과 동일).

| 컬럼명(DB) | 타입 | 설명 |
|------------|------|------|
| **mds_id** | INT PK | 자동 증가 |
| **mds_stat_date** | DATE UNIQUE | 통계일 (하루 1행) |
| **mds_total_visitors** | INT | ① 총 방문자수 |
| **mds_visits** | INT | ② 방문횟수 |
| **mds_new_visitors** | INT | ③ 신규방문자 |
| **mds_returning_visitors** | INT | ④ 재방문자 |
| **mds_page_views** | INT | ⑤ 총 페이지 뷰 |
| **mds_app_installs** | INT | ⑥ 어플설치 (당일 순증, 음수 가능) |
| **mds_member_signups** | INT | ⑦ 회원가입 |
| **mds_sales_count** | INT | ⑧ 판매 (건수) |
| **mds_created_at** | TIMESTAMPTZ | 생성일시 |
| **mds_updated_at** | TIMESTAMPTZ | 수정일시 |

---

## 2. 이걸로 구하는 통계

- **전주 / 금주**: 해당 주의 `mds_stat_date` 범위로 조회 후 8개 컬럼 각각 **SUM** → 주간 합계.
- **일별 breakdown**: 기간 내 행 그대로 조회.
- **누적 판매**: `SUM(mds_sales_count)` (전체 또는 특정일 이전).
- **누적 회원가입**: `SUM(mds_member_signups)`.
- **누적 어플설치**: `SUM(mds_app_installs)` (일별이 순증이면 합계가 누적).

※ **누적 매출**을 쓰려면 “당일 매출” 컬럼 하나를 나중에 추가하고 `SUM(당일 매출)`로 구하면 됨. 필요할 때 추가해도 됨.

---

## 3. 메뉴·화면과의 매핑

| 메뉴 | 데이터 |
|------|--------|
| **대시보드** | `tb_mall_daily_stat` 기간 조회 + 주간 SUM, 일별 목록 |
| **일별 데이터 관리** | `tb_mall_daily_stat` 목록/등록/수정/삭제 |

---

## 4. 마이그레이션

1. `tb_mall_daily_stat` 테이블 하나만 생성.
2. TypeORM 엔티티 1개 추가 후 sync 또는 migration 실행.
