-- 회원등급: tb_code 그룹 CUSTOMER_GRADE + 고객 컬럼 (1회 실행)
-- 코드 관리 화면에서도 등급 추가·수정 가능

ALTER TABLE tb_customer
  ADD COLUMN IF NOT EXISTS cu_customer_grade varchar(50) NULL DEFAULT 'GENERAL';

COMMENT ON COLUMN tb_customer.cu_customer_grade IS '회원등급 (tb_code CUSTOMER_GRADE cd_value, 기본 GENERAL)';

UPDATE tb_customer
SET cu_customer_grade = 'GENERAL'
WHERE cu_customer_grade IS NULL OR TRIM(cu_customer_grade) = '';

INSERT INTO tb_code (cd_group, cd_name, cd_value, cd_order)
SELECT v.cd_group, v.cd_name, v.cd_value, v.cd_order
FROM (VALUES
  ('CUSTOMER_GRADE', 'A',    'A',         1),
  ('CUSTOMER_GRADE', 'B',    'B',         2),
  ('CUSTOMER_GRADE', '일반', 'GENERAL',   3),
  ('CUSTOMER_GRADE', '악성', 'MALICIOUS', 4)
) AS v(cd_group, cd_name, cd_value, cd_order)
WHERE NOT EXISTS (
  SELECT 1 FROM tb_code c
  WHERE c.cd_group = v.cd_group AND c.cd_value = v.cd_value
);
