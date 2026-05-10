# 엑셀 데이터 일괄 삽입 가이드

## 1. 기존 데이터 확인

먼저 기존에 등록된 거래명세서 데이터를 확인하세요:

```bash
# PostgreSQL에 접속하여 확인 쿼리 실행
psql -U your_username -d your_database -f backend/scripts/check-existing-invoices.sql
```

또는 직접 SQL 쿼리 실행:
- `backend/scripts/check-existing-invoices.sql` 파일 참고

## 2. 엑셀 데이터 구조

엑셀 파일은 다음 컬럼 구조를 가져야 합니다:

### 거래명세서 기본 정보
- `customer_id` (필수): 고객 ID (tb_customer.cu_id)
- `invoice_number` (선택): 거래명세서 번호 (없으면 자동 생성)
- `issued_at` (선택): 발행일시 (YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm:ss 형식)
- `net_weight` (선택): 계근 중량
- `notes` (선택): 비고
- `vat_applied` (선택): 부가세 적용 여부 (true/false, 기본값: false)
- `vat_rate` (선택): 부가세율 (기본값: 10.0)
- `previous_balance` (선택): 이월잔액 (전일잔액)

### 거래명세서 항목 정보
각 거래명세서는 여러 항목을 가질 수 있습니다. 항목 정보는 별도 시트나 반복 행으로 구성:

- `order` (선택): 항목 순서 (1부터 시작, 기본값: 자동 증가)
- `product_name` (선택): 제품명
- `quantity` (선택): 수량
- `unit` (선택): 단위 (예: MT, kg, BALE)
- `unit_price` (선택): 단가
- `amount` (선택): 공급가액 (quantity × unit_price 또는 직접 입력)
- `vat_amount` (선택): 부가세액
- `weight` (선택): 중량
- `notes` (선택): 항목 비고
- `sales_item_id` (선택): 판매 항목 ID (tb_sales_item.si_id, 참고용)

## 3. 엑셀 데이터 예시

### 시트 1: 거래명세서 목록
| customer_id | invoice_number | issued_at | net_weight | notes | vat_applied | previous_balance |
|-------------|----------------|-----------|------------|-------|-------------|------------------|
| 1 | INV-2024-001 | 2024-01-15 | 1000.5 | 이월잔액 | true | 500000 |
| 2 | INV-2024-002 | 2024-01-16 | 2000.0 | | true | 0 |

### 시트 2: 거래명세서 항목
| invoice_number | order | product_name | quantity | unit | unit_price | amount | vat_amount | weight |
|----------------|-------|--------------|----------|------|------------|--------|-------------|--------|
| INV-2024-001 | 1 | 제품A | 10 | MT | 50000 | 500000 | 50000 | 10.0 |
| INV-2024-001 | 2 | 제품B | 5 | MT | 30000 | 150000 | 15000 | 5.0 |
| INV-2024-002 | 1 | 제품C | 20 | MT | 40000 | 800000 | 80000 | 20.0 |

## 4. 일괄 삽입 방법

### 방법 1: API를 통한 일괄 삽입 (권장)

Node.js 스크립트를 사용하여 엑셀 파일을 읽고 API를 호출:

```javascript
// backend/scripts/bulk-insert-invoices.js
const XLSX = require('xlsx');
const axios = require('axios');

// 엑셀 파일 읽기
const workbook = XLSX.readFile('invoices.xlsx');
const invoiceSheet = workbook.Sheets[workbook.SheetNames[0]];
const itemSheet = workbook.Sheets[workbook.SheetNames[1]];

// 데이터 파싱
const invoices = XLSX.utils.sheet_to_json(invoiceSheet);
const items = XLSX.utils.sheet_to_json(itemSheet);

// API 엔드포인트
const API_URL = 'http://localhost:3000/api/sales/invoices';
const AUTH_TOKEN = 'your_jwt_token_here';

// 각 거래명세서에 대해 API 호출
async function insertInvoices() {
  for (const invoice of invoices) {
    // 해당 거래명세서의 항목 찾기
    const invoiceItems = items.filter(item => 
      item.invoice_number === invoice.invoice_number
    );

    const payload = {
      customerId: invoice.customer_id.toString(),
      invoiceNumber: invoice.invoice_number || null,
      issuedAt: invoice.issued_at || null,
      netWeight: invoice.net_weight ? parseFloat(invoice.net_weight) : null,
      notes: invoice.notes || null,
      vatApplied: invoice.vat_applied === true || invoice.vat_applied === 'true',
      vatRate: invoice.vat_rate ? parseFloat(invoice.vat_rate) : 10.0,
      items: invoiceItems.map(item => ({
        order: item.order ? parseInt(item.order) : undefined,
        productName: item.product_name || null,
        quantity: item.quantity ? parseFloat(item.quantity) : null,
        unit: item.unit || null,
        unitPrice: item.unit_price ? parseFloat(item.unit_price) : null,
        amount: item.amount ? parseFloat(item.amount) : null,
        vatAmount: item.vat_amount ? parseFloat(item.vat_amount) : null,
        weight: item.weight ? parseFloat(item.weight) : null,
        notes: item.notes || null,
        salesItemId: item.sales_item_id ? item.sales_item_id.toString() : null,
      })),
    };

    try {
      const response = await axios.post(API_URL, payload, {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
      console.log(`✓ 거래명세서 생성 완료: ${invoice.invoice_number || response.data.invoiceNumber}`);
    } catch (error) {
      console.error(`✗ 거래명세서 생성 실패: ${invoice.invoice_number}`, error.response?.data || error.message);
    }
  }
}

insertInvoices();
```

### 방법 2: SQL 직접 삽입 (주의 필요)

SQL을 직접 사용하는 경우, 외래키 제약조건과 트랜잭션을 고려해야 합니다:

```sql
-- 예시: 단일 거래명세서 삽입
BEGIN;

-- 1. 거래명세서 삽입
INSERT INTO tb_invoice (
    cu_id,
    iv_invoice_number,
    iv_status,
    iv_issued_at,
    iv_net_weight,
    iv_invoice_amount,
    iv_subtotal,
    iv_vat_amount,
    iv_vat_applied,
    iv_vat_rate,
    iv_previous_balance,
    iv_notes,
    iv_created_at,
    iv_updated_at
) VALUES (
    1,  -- customer_id
    'INV-2024-001',  -- invoice_number
    'ISSUED',
    '2024-01-15 00:00:00',  -- issued_at
    1000.5,  -- net_weight
    550000,  -- invoice_amount (subtotal + vat)
    500000,  -- subtotal
    50000,   -- vat_amount
    true,    -- vat_applied
    10.0,    -- vat_rate
    500000,  -- previous_balance
    '이월잔액',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) RETURNING iv_id;

-- 2. 거래명세서 항목 삽입 (위에서 반환된 iv_id 사용)
INSERT INTO tb_invoice_item (
    iv_id,
    ivi_order,
    ivi_product_name,
    ivi_quantity,
    ivi_unit,
    ivi_unit_price,
    ivi_amount,
    ivi_vat_amount,
    ivi_weight,
    ivi_notes,
    ivi_created_at,
    ivi_updated_at
) VALUES 
(1, 1, '제품A', 10, 'MT', 50000, 500000, 50000, 10.0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 2, '제품B', 5, 'MT', 30000, 150000, 15000, 5.0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

COMMIT;
```

## 5. 주의사항

1. **고객 ID 확인**: `customer_id`는 반드시 `tb_customer` 테이블에 존재하는 ID여야 합니다.
2. **거래명세서 번호 중복**: `invoice_number`는 유니크 제약조건이 있으므로 중복되지 않아야 합니다.
3. **이월잔액**: `previous_balance`는 발행 시점의 거래처 채권 잔액입니다. API를 통한 삽입 시 자동 계산되지만, SQL 직접 삽입 시 수동으로 입력해야 합니다.
4. **트랜잭션**: 여러 거래명세서를 삽입할 때는 트랜잭션을 사용하여 일관성을 보장하세요.
5. **채권 자동 생성**: API를 통한 삽입 시 채권(AccountsReceivable)이 자동으로 생성되지만, SQL 직접 삽입 시 수동으로 생성해야 합니다.

## 6. 검증

삽입 후 다음 쿼리로 데이터를 확인하세요:

```sql
-- 최근 삽입된 거래명세서 확인
SELECT 
    iv.iv_id,
    iv.iv_invoice_number,
    cu.cu_company_name,
    iv.iv_previous_balance,
    iv.iv_invoice_amount,
    COUNT(ivi.ivi_id) AS item_count
FROM tb_invoice iv
LEFT JOIN tb_customer cu ON iv.cu_id = cu.cu_id
LEFT JOIN tb_invoice_item ivi ON iv.iv_id = ivi.iv_id
WHERE iv.iv_deleted_at IS NULL
GROUP BY iv.iv_id, iv.iv_invoice_number, cu.cu_company_name, iv.iv_previous_balance, iv.iv_invoice_amount
ORDER BY iv.iv_created_at DESC
LIMIT 10;
```
