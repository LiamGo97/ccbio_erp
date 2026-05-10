# 외부 API (재고 조회 · 고객 동기화 · 안전운임 조회)

이커머스 등 외부 시스템에서 ERP 재고를 조회하거나, 몰 회원가입 시 고객 정보를 동기화하고, **안전운임 요금표**를 조회할 수 있습니다.

## 인증

모든 요청에 **X-API-Key** 헤더가 필요합니다.

```
X-API-Key: your-secret-api-key
```

- 환경변수 `EXTERNAL_API_KEY`에 설정한 값과 일치해야 합니다.
- `.env` 또는 `.env.local`에 `EXTERNAL_API_KEY=원하는비밀키` 추가 후 서버 재시작

## 엔드포인트

### 고객 동기화 — 이커머스 회원가입 → ERP

| 항목 | 내용 |
|------|------|
| **URL** | `POST /api/external/customers/sync` |
| **인증** | 상단 [인증](#인증)과 동일 — `X-API-Key` (환경변수 `EXTERNAL_API_KEY`) |
| **호출 시점** | 몰에서 **회원가입(또는 회원 정보 확정) 직후** 몰 서버가 ERP로 1회(또는 재시도) 호출 |
| **성공 응답** | `{ "customerId": "<cu_id>" }` — 몰 DB `us_erp_customer_id`(또는 동일 역할 컬럼)에 저장 |

#### 구 참참바이오 vs 신규 참참바이오 (필드가 다름)

ERP 고객에는 참참 관련 컬럼이 **두 가지** 있습니다. 이커머스 연동 API는 **신규 쪽만** 다룹니다.

| 구분 | ERP 화면·용어 | DB 컬럼 | 코드 그룹 (`tb_code.cd_group`) | 이 API가 설정하나? |
|------|----------------|---------|--------------------------------|-------------------|
| **구(레거시) 참참바이오** | 구 참참회원 여부 | `cu_chamcham_status` | `CHAMCHAM_STATUS` | **아니요.** 본문에 해당 필드가 없으며, 동기화 페이로드로는 **쓰지 않습니다.** 신규 생성 시 `NULL`, 기존 고객 갱신 시 **기존 구 참참 값은 그대로 유지**됩니다. |
| **신규 참참바이오 (Chamcharm 몰)** | 신규 참참회원 여부 | `cu_chamcharm_member_status` | `CHAMCHARM_MEMBER_STATUS` | **예(항상 반영).** 회원가입·정보 수정 등 **이 API로 동기화할 때마다** 신규 참참 필드를 설정합니다. 요청에 **`chamcharmMemberStatus`** 가 있으면 해당 값(`cd_name` 또는 `cd_value`)으로 저장하고, **없거나 빈 문자열이면** ERP가 `CHAMCHARM_MEMBER_STATUS`에서 기본 참참회원 코드를 골라 저장합니다. |

정리하면, **몰 회원가입 연동만으로 “구 참참바이오 회원”으로 만들지는 않습니다.**  
**신규 참참(Chamcharm)** 은 몰에서 필드를 안내도 동기화 시 **자동으로 참참회원 코드가 들어갑니다.** 특정 코드로 덮어쓰려면 **`chamcharmMemberStatus`** 에 ERP `tb_code`와 동일한 `cd_name` 또는 `cd_value`를 넣습니다. 운영에서 기본값을 고정하려면 환경변수 **`EXTERNAL_MALL_DEFAULT_CHAMCHARM_MEMBER_CD_VALUE`**(또는 **`EXTERNAL_MALL_DEFAULT_CHAMCHARM_MEMBER_STATUS`**)에 해당 코드를 지정합니다. 자동 선택 순서: 환경변수 → `CHAMCHARM_MEMBER` → `NEW_MALL_MEMBER` → `참참회원` → `신규몰 참참회원` → (위에 없으면) 비회원이 아닌 코드 중 `cd_order`가 가장 작은 항목.

#### 기존 고객 매칭 순서 (같은 사람이면 갱신)

1. `cu_mall_user_id` = 요청 `mallUserId`  
2. 없으면 사업자등록번호 **숫자만** 동일  
3. 없으면 휴대전화 **숫자만** 동일  

매칭되면 `update`, 없으면 `create` 합니다.

#### 요청 본문 필드 요약

| JSON 필드 | 필수 | ERP 반영 | 비고 |
|-----------|:----:|----------|------|
| `mallUserId` | ✓ | `cu_mall_user_id` | 정수. 몰 회원 PK |
| `name` | ✓ | `ceo` (대표자명) | |
| `phone` | | `cu_phone` | |
| `email` | | *(저장 안 함)* | 몰 스펙 호환용으로만 수신 |
| `memberType` | | `cu_member_type` | 예: `NON_BUSINESS`, `BUSINESS` 또는 코드와 맞는 문자열 |
| `postalCode`, `addressRoad`, `addressJibun`, `addressDetail`, `regionName`, `cityName`, `dongName`, `addressDefaultType` | | 주소·지역 관련 컬럼 | `dongName`은 상세주소에 이어 붙일 수 있음 |
| **`legalBCode`** | | **`cu_legal_b_code`** | 법정동코드 **숫자 10자리**(카카오 주소 `b_code` 등). 공백 무시. 생략 시 신규는 `NULL`, 기존 고객 갱신 시 **보내지 않으면 기존 법정동코드 유지** |
| `nickname`, `phoneLandline`, `accountType` | | *(현재 동기화 빌더에서 미사용)* | DTO만 존재 시 확장 여지 |
| **`chamcharmMemberStatus`** | | **`cu_chamcharm_member_status`** | 생략·빈 문자열 시 ERP 기본 참참회원 코드 자동 적용. 넣을 때는 **`CHAMCHARM_MEMBER_STATUS`의 `cd_name` 또는 `cd_value`와 동일 문자열** |
| `farm` | | 축종·운영·급여·두수 등 | `livestockTypes`, `operationMethod`, `feedingMethod`, `livestockCount` |
| `business` | | 상호·사업자번호 | `companyName`, `businessRegistrationNumber` |

#### 사전 준비 (운영)

1. DB: `backend/scripts/add-customer-chamcharm-member-status-column.sql` 로 `cu_chamcharm_member_status` 추가, `backend/scripts/alter-tb-customer-legal-b-code.sql` 로 `cu_legal_b_code` 추가(미적용 시)  
2. 코드 관리: 그룹 **`CHAMCHARM_MEMBER_STATUS`** 에 **참참회원·비회원** 등 행 등록(비회원만 있으면 동기화 시 오류)  
3. 서버: `EXTERNAL_API_KEY` 설정 후 재시작. (선택) `EXTERNAL_MALL_DEFAULT_CHAMCHARM_MEMBER_CD_VALUE` 로 기본 참참 코드 지정  

이전에 `cu_email` 컬럼을 썼다가 제거한 환경은 `backend/scripts/drop-customer-email-column.sql` 참고.

#### 이커머스(몰) 쪽 반영 사항

몰 서버에서 본 API를 호출하는 코드에 다음을 반영하세요.

- 주소 검색(카카오 등)으로 **법정동코드(`b_code`)** 를 받을 수 있으면, JSON **`legalBCode`** 로 전달합니다(10자리 숫자). 없으면 생략 가능합니다.  
- **`chamcharmMemberStatus`** 는 선택입니다. 생략·빈 값이어도 ERP가 신규 참참회원 기본 코드를 넣습니다. 다른 코드를 쓰려면 ERP 코드 관리와 동일한 문자열만 사용합니다.

#### 요청 예시 (법정동 포함, 참참 필드 생략 → ERP 기본 참참회원)

```json
{
  "mallUserId": 123,
  "name": "홍길동",
  "phone": "010-1234-5678",
  "memberType": "NON_BUSINESS",
  "legalBCode": "1168010100",
  "postalCode": "12345",
  "addressRoad": "서울시 강남구 테헤란로 123",
  "addressDetail": "101동 123호",
  "regionName": "서울특별시",
  "cityName": "강남구",
  "addressDefaultType": "ROAD",
  "farm": {
    "livestockTypes": "HANWOO",
    "operationMethod": "FATTENING",
    "feedingMethod": "SELF_MIX",
    "livestockCount": 50
  },
  "business": {
    "companyName": "홍길동농장",
    "businessRegistrationNumber": "123-45-67890"
  }
}
```

명시적으로 참참 코드를 보낼 때는 ERP `tb_code`의 `cd_name` 또는 `cd_value`와 **완전히 같게** 넣습니다(예: `"chamcharmMemberStatus": "참참회원"`).

#### 최소 호출 예시 (`curl`, 참참·법정동 생략 시에도 ERP가 기본 참참회원 설정)

```bash
curl -sS -X POST "http://localhost:3001/api/external/customers/sync" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key-change-this" \
  -d '{"mallUserId":999001,"name":"테스트농가","phone":"010-0000-0001","memberType":"NON_BUSINESS"}'
```

### 안전운임 요금 조회 (이커머스·외부 시스템)

ERP에 엑셀 등으로 적재된 **안전운임 요금표**를 몰에서 조회할 때 사용합니다. **고객 동기화와 동일한 인증**입니다.

| 항목 | 내용 |
|------|------|
| **인증** | 헤더 `X-API-Key` — 환경변수 `EXTERNAL_API_KEY`와 일치 |
| **성격** | **읽기 전용** (업로드·수정은 ERP 화면 또는 기존 JWT API) |

#### 엔드포인트 요약

| 메서드 | URL | 설명 |
|--------|-----|------|
| `GET` | `/api/external/safe-freight-rates` | 요금 행 목록(페이지). 쿼리로 지역·항구·거리·시행일 필터 |
| `GET` | `/api/external/safe-freight-rates/regions` | 요금표에 나오는 시·도 목록 |
| `GET` | `/api/external/safe-freight-rates/cities?region=...` | 해당 지역의 시·군·구 목록 |
| `GET` | `/api/external/safe-freight-rates/towns?region=...&city=...` | 해당 시군구의 읍·면·동 목록 |
| `GET` | `/api/external/safe-freight-rates/distances` | 사용 중인 거리(km) 구간 목록 |

#### 목록 조회 쿼리 파라미터 (`GET .../safe-freight-rates`)

| 파라미터 | 필수 | 설명 |
|----------|:----:|------|
| `page` | | 기본 `1` |
| `limit` | | 기본 `100`, **최대 `500`** |
| `sortBy` | | 예: `effectiveFrom`, `regionName`, `cityName`, `townName`, `distanceKm`, `safeTransportRate`, `createdAt` (내부 ERP 목록과 동일 계열) |
| `sortOrder` | | `asc` \| `desc`, 기본 `desc` |
| `region` | | `regionName`과 **완전 일치** |
| `city` | | `cityName`과 **완전 일치** |
| `townName` | | 읍·면·동 **완전 일치** |
| `portCodeId` | | `tb_code.cd_id` (코드 그룹 `DESTINATION_PORT`) |
| `distanceKm` | | 구간 거리(km) **완전 일치** |
| `effectiveDate` | | `YYYY-MM-DD`. 지정 시 그 날짜에 유효한 요금만 (`effectiveFrom` ≤ 날짜 ≤ `effectiveTo` 또는 `effectiveTo` 없음). **몰에서 “당일 요금”을 쓸 때 권장** |
| **`legalBCode`** | | **법정동코드**(숫자 10자리, 하이픈·공백 무시). ERP **`tb_legal_admin_master`** 에서 시·도·시군구·읍면동(리명이 있으면 `읍면동 리` 형태)으로 변환한 뒤, 그 값으로 `region` / `city` / `townName` 과 **동일한 정확 일치** 필터를 적용합니다. **`legalBCode`를 넣으면 쿼리의 `region`, `city`, `townName`은 무시됩니다** (몰은 주소에서 받은 `b_code`만 넘기면 됨). 마스터에 없거나 삭제된 코드면 **HTTP 400** |

#### `legalBCode` 사용 시 주의

- 법정동 마스터는 ERP **법정동 관리** 화면에서 국토부 형식 등으로 적재되어 있어야 합니다.
- 안전운임 요금표의 **읍·면·동 문자열**과 법정동 마스터의 표기가 100% 같지 않으면 **조회 결과가 0건**일 수 있습니다. 그때는 ERP 안전운임 화면의 명칭을 기준으로 마스터·요금표를 맞추거나, 기존처럼 `region` / `city` / `townName` 직접 지정을 사용하세요.

#### 목록 응답 (`data[]` 행 필드)

| JSON 필드 | 설명 |
|-----------|------|
| `id` | 요금 행 ID |
| `effectiveFrom`, `effectiveTo` | 시행 시작·종료일 (`YYYY-MM-DD`, 종료 없으면 `effectiveTo`는 `null`) |
| `portCodeId` | 항구 코드 ID (없으면 `null`) |
| `portName`, `portCodeValue` | 코드 마스터 표시명·값 |
| `regionName`, `cityName`, `townName` | 시·도, 시·군·구, 읍·면·동 |
| `distanceKm` | 구간 거리(km), 없으면 `null` |
| `containerSize` | 예: `40FT` |
| `safeTransportRate` | 안전운송운임(숫자, 원) |

#### 목록 응답 — 루트 추가 필드 (`legalBCode` 쿼리를 준 경우만)

| JSON 필드 | 설명 |
|-----------|------|
| `resolvedFromLegalBCode` | `{ legalBCode, regionName, cityName, townName }` — 마스터에서 풀린 값(몰에서 디버그·표시용) |

#### `curl` 예시

```bash
# 당일 기준·부산항(portCodeId는 운영 DB의 DESTINATION_PORT cd_id로 교체)
curl -sS -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/safe-freight-rates?effectiveDate=2026-04-20&portCodeId=123&region=경상남도&city=창원시&limit=50"

# 법정동코드만 넘겨 지역 필터 (region/city/townName 쿼리는 무시됨)
curl -sS -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/safe-freight-rates?legalBCode=1168010100&portCodeId=123&distanceKm=50&effectiveDate=2026-04-20&limit=20"

curl -sS -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/safe-freight-rates/regions"

curl -sS -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/safe-freight-rates/cities?region=경상남도"
```

#### 몰 연동 시 권장

- **HTTPS** + 동일 `EXTERNAL_API_KEY` 관리.
- 결제/배송비 단계에서 ERP 지연에 대비해 **짧은 TTL 캐시**(지역 메타·요금 목록)와 **타임아웃**을 두는 것을 권장합니다.
- 요금이 시행일로 갈리므로 **`effectiveDate`를 명시**하는 편이 안전합니다.

### 재고 조회

| 엔드포인트 | 설명 | 대시보드 대응 |
|-----------|------|---------------|
| `GET /api/external/inventory/by-bl` | **BL 단위 통합** (입고대기·입고예정·입고확정, 제외·판매완료 제외) | - |
| `GET /api/external/inventory/all` | **전체 통합** (확정·입고예정·입고대기 한 번에) | - |
| `GET /api/external/inventory/confirmed` | 입고확정 재고 | 주간재고현황 |
| `GET /api/external/inventory/scheduled` | 입고예정 재고 | 통관전 재고 |
| `GET /api/external/inventory/pending` | 입고대기 재고 | 입항예정 |

## 사용 예시

### BL 단위 재고 목록 (입고대기·입고예정·입고확정 통합)

```bash
curl -H "X-API-Key: your-secret-api-key" \
  http://localhost:3001/api/external/inventory/by-bl
```

응답 예시:

```json
[
  {
    "bl": "CCBIO2025001",
    "bk": "BK001",
    "status": "INBOUND_CONFIRMED",
    "orderId": "uuid",
    "product": "COTTON",
    "productName": "목화",
    "etaDate": "2025-03-15",
    "containerCount": 3,
    "totalBales": 450,
    "totalWeight": 25000,
    "availableBales": 300,
    "availableWeight": 18000,
    "containers": [
      {
        "containerNo": "ABCD1234567",
        "bales": 150,
        "availableBales": 100,
        "weight": 8500,
        "availableWeight": 6000,
        "packing": "SMALL",
        "packingName": "스몰",
        "unitPrice": 2.5,
        "currency": "$",
        "tradeGrade": "A",
        "salesGrade": "A",
        "pendingPurchaseCost": 2.3,
        "confirmedPurchaseCost": 2.4
      }
    ]
  }
]
```

- `status`: `INBOUND_PENDING`(입고대기) | `INBOUND_SCHEDULED`(입고예정) | `INBOUND_CONFIRMED`(입고확정)
- **중량(weight, availableWeight)**: kg 단위로 반환 (DB 저장 단위 톤 → kg 변환)
- **베일(bales)**: 영업 베일(salesBales) 기준
- **컨테이너 필드**: `containerNo`, `bales`, `availableBales`, `weight`, `availableWeight`, `packing`, `packingName`, `unitPrice`, `currency`, `tradeGrade`, `salesGrade`, `pendingPurchaseCost`, `confirmedPurchaseCost`
- `tradeGrade`: 무역 등급
- `salesGrade`: 영업 등급
- `unitPrice`: 컨테이너 단가 (계약/송장 단가, co_unit_price)
- `currency`: 통화 기호 (예: $, €, ₩ — 코드 관리 CURRENCY의 name 값)
- `pendingPurchaseCost`: 예정원가 (입고예정·입고확정 시)
- `confirmedPurchaseCost`: 확정원가 (입고확정 시)
- 제외된 재고(excludeFromInventory), 판매완료(SOLD_OUT) 제외
- **베일·중량 모두 0인 BL**은 응답에서 제외

### 전체 통합 조회 (확정·입고예정·입고대기 한 번에)

```bash
curl -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/inventory/all"
```

월 필터 적용 (scheduled·pending에 ETA 기준 적용):

```bash
curl -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/inventory/all?month=2025-03"
```

기간 지정 (dateFrom/dateTo는 pending에만 적용, scheduled는 month만 지원):

```bash
curl -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/inventory/all?dateFrom=2025-03-01&dateTo=2025-03-31"
```

응답 예시:

```json
{
  "confirmed": [ /* 컨테이너 배열 */ ],
  "scheduled": [ /* 컨테이너 배열 */ ],
  "pending": [ /* 주문 배열 (containers 포함) */ ]
}
```

### 입고확정 (주간재고현황)

```bash
curl -H "X-API-Key: your-secret-api-key" \
  http://localhost:3001/api/external/inventory/confirmed
```

### 입고예정 (통관전 재고) - 2025년 3월 필터

```bash
curl -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/inventory/scheduled?month=2025-03"
```

### 입고대기 (입항예정) - 2025년 3월 필터

```bash
curl -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/inventory/pending?month=2025-03"
```

### 입고대기 - 기간 지정

```bash
curl -H "X-API-Key: your-secret-api-key" \
  "http://localhost:3001/api/external/inventory/pending?dateFrom=2025-03-01&dateTo=2025-03-31"
```

## 응답 형식

- **confirmed, scheduled**: 컨테이너 배열 (listContainers와 동일). 베일·중량 모두 0인 컨테이너는 API에서 제외
- **pending**: 주문 배열 (listTradeOrders와 동일, containers 포함)

### 기간 필터 차이

| 구분 | confirmed | scheduled | pending |
|------|-----------|-----------|---------|
| 기간 필터 | 없음 (전체) | month (YYYY-MM) | month 또는 dateFrom/dateTo |

## 보안

- 운영 환경에서는 **HTTPS** 사용 필수
- API Key는 환경변수로 관리, 코드에 하드코딩 금지
- 필요 시 IP 화이트리스트 등 추가 보안 적용 가능
