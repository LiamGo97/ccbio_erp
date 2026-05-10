/**
 * CCBio ERP DB 스키마 (Text-to-SQL GPT용)
 * TypeORM 엔티티 기반으로 생성
 */
export const CCBIO_ERP_SCHEMA = `
-- CCBio ERP 데이터베이스 스키마 (PostgreSQL)
-- 테이블명: 실제 DB 컬럼명 사용

-- tb_customer: 고객 정보
CREATE TABLE tb_customer (
  cu_id BIGSERIAL PRIMARY KEY,
  cu_region_id INT,
  cu_postal_code VARCHAR(10),
  cu_address VARCHAR(255),
  cu_address_detail VARCHAR(255),
  cu_city_id INT,
  cu_company_name VARCHAR(150),
  cu_ceo VARCHAR(100),
  cu_phone VARCHAR(50),
  cu_species VARCHAR(100),
  cu_feeding VARCHAR(100),
  cu_customer_type VARCHAR(20),
  cu_created_at TIMESTAMPTZ,
  cu_updated_at TIMESTAMPTZ
);

-- tb_region: 지역 (시/도)
CREATE TABLE tb_region (
  re_id SERIAL PRIMARY KEY,
  re_name VARCHAR(50) UNIQUE,
  re_code VARCHAR(20),
  re_order INT
);

-- tb_city: 시/군/구
CREATE TABLE tb_city (
  ci_id SERIAL PRIMARY KEY,
  ci_region_id INT REFERENCES tb_region(re_id),
  ci_name VARCHAR(50),
  ci_code VARCHAR(20),
  ci_order INT
);

-- tb_sales: 판매 (예약/판매)
CREATE TABLE tb_sales (
  sa_id BIGSERIAL PRIMARY KEY,
  cu_id BIGINT REFERENCES tb_customer(cu_id),
  sa_reservation_date DATE,
  sa_sales_date DATE,
  sa_transport_fee DECIMAL(12,2),
  sa_unloading_address TEXT,
  sa_unloading_region VARCHAR(100),
  sa_unloading_city VARCHAR(50),
  us_id INT,
  sa_invoice_status VARCHAR(20),
  sa_status VARCHAR(30),
  sa_cancelled_at TIMESTAMP,
  sa_created_at TIMESTAMPTZ,
  sa_updated_at TIMESTAMPTZ
);

-- tb_sales_item: 판매 항목
CREATE TABLE tb_sales_item (
  si_id BIGSERIAL PRIMARY KEY,
  sa_id BIGINT REFERENCES tb_sales(sa_id) ON DELETE CASCADE,
  co_id BIGINT,
  si_container_type VARCHAR(20),
  si_sales_unit_price NUMERIC(14,2),
  si_sto_cost NUMERIC(14,2),
  si_dt_cost NUMERIC(14,2),
  si_cargo_weight NUMERIC(14,4),
  si_status VARCHAR(30),
  si_created_at TIMESTAMPTZ,
  si_updated_at TIMESTAMPTZ
);

-- tb_sales_delivery: 배송 정보 (tb_sales 1:1)
CREATE TABLE tb_sales_delivery (
  sd_id BIGSERIAL PRIMARY KEY,
  sd_sales_id BIGINT UNIQUE REFERENCES tb_sales(sa_id) ON DELETE CASCADE,
  sd_status VARCHAR(20),
  sd_order_number VARCHAR(50),
  sd_unloading_address TEXT,
  sd_unloading_schedule_date DATE,
  sd_dispatch_company_id INT,
  sd_unloading_company_id INT,
  sd_transport_fee DECIMAL(12,2),
  sd_weighing_fee DECIMAL(12,2),
  sd_vehicle_number VARCHAR(50),
  sd_driver_name VARCHAR(50),
  sd_created_at TIMESTAMPTZ,
  sd_updated_at TIMESTAMPTZ
);

-- tb_invoice: 거래명세서
CREATE TABLE tb_invoice (
  iv_id BIGSERIAL PRIMARY KEY,
  iv_invoice_number VARCHAR(50) UNIQUE,
  iv_status VARCHAR(20),
  iv_net_weight DECIMAL(12,4),
  iv_invoice_amount DECIMAL(14,2),
  iv_subtotal DECIMAL(14,2),
  iv_total_quantity DECIMAL(14,4),
  iv_vat_amount DECIMAL(14,2),
  cu_id BIGINT REFERENCES tb_customer(cu_id),
  iv_company_name VARCHAR(150),
  iv_ceo VARCHAR(100),
  iv_phone VARCHAR(50),
  iv_issued_at TIMESTAMP,
  iv_created_at TIMESTAMPTZ,
  iv_updated_at TIMESTAMPTZ
);

-- tb_invoice_item: 거래명세서 항목
CREATE TABLE tb_invoice_item (
  ivi_id BIGSERIAL PRIMARY KEY,
  iv_id BIGINT REFERENCES tb_invoice(iv_id) ON DELETE CASCADE,
  si_id BIGINT,
  ivi_product_name VARCHAR(200),
  ivi_quantity DECIMAL(12,4),
  ivi_unit VARCHAR(50),
  ivi_unit_price DECIMAL(14,2),
  ivi_amount DECIMAL(14,2),
  ivi_weight DECIMAL(12,4),
  ivi_created_at TIMESTAMPTZ,
  ivi_updated_at TIMESTAMPTZ
);

-- tb_accounts_receivable: 채권 (고객별 1:1)
CREATE TABLE tb_accounts_receivable (
  ar_id BIGSERIAL PRIMARY KEY,
  cu_id BIGINT UNIQUE REFERENCES tb_customer(cu_id) ON DELETE CASCADE,
  ar_total_sales DECIMAL(16,2),
  ar_total_collected DECIMAL(16,2),
  ar_balance DECIMAL(16,2),
  ar_status VARCHAR(20),
  ar_occurred_date DATE,
  ar_last_payment_due_date DATE,
  ar_created_at TIMESTAMPTZ,
  ar_updated_at TIMESTAMPTZ
);

-- tb_receivable_collection: 수금 내역
CREATE TABLE tb_receivable_collection (
  rc_id BIGSERIAL PRIMARY KEY,
  ar_id BIGINT REFERENCES tb_accounts_receivable(ar_id) ON DELETE CASCADE,
  cu_id BIGINT REFERENCES tb_customer(cu_id),
  rc_collection_amount DECIMAL(16,2),
  rc_collection_date DATE,
  rc_collection_method VARCHAR(50),
  rc_created_at TIMESTAMPTZ
);

-- tb_supplier: 공급자
CREATE TABLE tb_supplier (
  sp_id SERIAL PRIMARY KEY,
  sp_company_name VARCHAR(150),
  sp_representative_name VARCHAR(100),
  sp_business_registration_number VARCHAR(50),
  sp_address VARCHAR(255),
  sp_tel VARCHAR(50),
  sp_status BOOLEAN
);

-- tb_dispatch_company: 배차 업체
CREATE TABLE tb_dispatch_company (
  dc_id SERIAL PRIMARY KEY,
  dc_name VARCHAR(100),
  dc_status BOOLEAN
);

-- tb_unloading_company: 하차 업체
CREATE TABLE tb_unloading_company (
  uc_id SERIAL PRIMARY KEY,
  uc_representative_name VARCHAR(100),
  uc_contact VARCHAR(50)
);

-- tb_container: 컨테이너 (무역 재고) - 재고 = 이 테이블. 컨테이너별로 1건씩 존재
CREATE TABLE tb_container (
  co_id BIGSERIAL PRIMARY KEY,
  co_order_id BIGINT,
  co_container_no VARCHAR(64),
  co_product VARCHAR(100),
  co_trade_grade VARCHAR(100),
  co_weight NUMERIC(14,4),
  co_unit_price NUMERIC(14,4),
  co_inventory_status VARCHAR(30),
  co_exclude_from_inventory_yn BOOLEAN DEFAULT false,
  co_created_at TIMESTAMPTZ,
  co_updated_at TIMESTAMPTZ
);
-- 재고 집계 시: co_product로 재품별 그룹, COUNT(co_id)로 컨테이너 수. co_exclude_from_inventory_yn = false 인 것만 재고로 포함

-- tb_trade_order: 무역 발주
CREATE TABLE tb_trade_order (
  to_id BIGSERIAL PRIMARY KEY,
  tc_id BIGINT,
  to_sequence INT,
  to_order_date DATE,
  to_eta_date DATE,
  to_status VARCHAR(20),
  to_product_name_label VARCHAR(255),
  to_quantity NUMERIC(14,4),
  to_unit_price NUMERIC(14,4),
  to_created_at TIMESTAMPTZ,
  to_updated_at TIMESTAMPTZ
);

-- tb_trade_contract: 무역 계약
CREATE TABLE tb_trade_contract (
  tc_id BIGSERIAL PRIMARY KEY,
  tc_contract_no VARCHAR(255) UNIQUE,
  tc_exporter VARCHAR(255),
  tc_product_name VARCHAR(255),
  tc_quantity NUMERIC(14,4),
  tc_unit_price NUMERIC(14,4),
  tc_currency VARCHAR(10),
  tc_status VARCHAR(20),
  tc_created_at TIMESTAMPTZ,
  tc_updated_at TIMESTAMPTZ
);

-- 관계 요약:
-- tb_customer (cu_id) <- tb_sales.cu_id, tb_invoice.cu_id, tb_accounts_receivable.cu_id
-- tb_sales (sa_id) <- tb_sales_item.sa_id, tb_sales_delivery.sd_sales_id
-- tb_invoice (iv_id) <- tb_invoice_item.iv_id
-- tb_accounts_receivable (ar_id) <- tb_receivable_collection.ar_id
-- tb_region (re_id) <- tb_city.ci_region_id
-- tb_trade_order (to_id) <- tb_container.co_order_id
-- tb_trade_contract (tc_id) <- tb_trade_order.tc_id
`;
