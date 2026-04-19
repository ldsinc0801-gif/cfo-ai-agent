-- ============================================================
-- Migration 004: MID-A メタデータのSupabase移行
-- secretary company-settings, templates, billing-configs
-- 実行方法: Supabase SQL Editor に貼り付けて Run
-- ============================================================

-- ============================================================
-- Part A: secretary_company_settings（請求書用会社情報）
-- ============================================================

CREATE TABLE secretary_company_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  company_name    TEXT DEFAULT '',
  postal_code     TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  representative  TEXT DEFAULT '',
  registration_number TEXT DEFAULT '',
  bank_name       TEXT DEFAULT '',
  branch_name     TEXT DEFAULT '',
  account_type    TEXT DEFAULT '',
  account_number  TEXT DEFAULT '',
  account_holder  TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sec_company_tenant ON secretary_company_settings(tenant_id);

-- ============================================================
-- Part B: secretary_templates（書類テンプレートメタデータ+レイアウト）
-- ============================================================

CREATE TABLE secretary_templates (
  id              TEXT PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'invoice',
  template_file   TEXT DEFAULT '',
  fields          JSONB DEFAULT '[]',
  layout          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sec_templates_tenant ON secretary_templates(tenant_id);

-- ============================================================
-- Part C: billing_configs（顧客別請求設定）
-- ============================================================

CREATE TABLE billing_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name   TEXT NOT NULL,
  closing_day     INTEGER NOT NULL DEFAULT 0,
  invoice_day     INTEGER NOT NULL DEFAULT 1,
  due_date_type   TEXT NOT NULL DEFAULT 'end_next',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_name)
);

CREATE INDEX idx_billing_configs_tenant ON billing_configs(tenant_id);
