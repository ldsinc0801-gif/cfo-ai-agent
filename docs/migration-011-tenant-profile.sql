-- ============================================================
-- Migration 011: テナント会社情報
--
-- サイドバーの「会社情報」ページで編集する会社全体の基本情報。
-- 会計AIの決算月選択や、秘書AIの書類生成時の宛名情報にも使用する。
-- secretary_company_settings と一部項目が重複するが、こちらは「会社全体の
-- マスター情報」として位置付ける。
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_profile (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  company_name        TEXT,
  postal_code         TEXT,
  address             TEXT,
  phone               TEXT,
  representative      TEXT,
  established_date    DATE,
  corporate_number    TEXT,
  invoice_registered  BOOLEAN NOT NULL DEFAULT false,
  invoice_number      TEXT,
  industry            TEXT,
  employee_count      TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_profile_tenant ON tenant_profile(tenant_id);

ALTER TABLE tenant_profile ENABLE ROW LEVEL SECURITY;
